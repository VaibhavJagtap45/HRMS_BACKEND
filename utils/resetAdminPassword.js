// ─────────────────────────────────────────────────────────────────────────────
// Admin unlock / password-reset utility.
//
// Use this when you're locked out of the live site: it sets a KNOWN password on
// an HR account (creating the account if it doesn't exist) directly in MongoDB,
// so you can sign in immediately without needing email/OTP.
//
// Run it from your own machine (which can resolve the Atlas SRV record):
//   cd backend
//   node utils/resetAdminPassword.js                       # hr@albostech.com / Admin@12345
//   node utils/resetAdminPassword.js you@company.com Secret123
//   node utils/resetAdminPassword.js you@company.com Secret123 "Your Name"
//
// IMPORTANT: it acts on the database in MONGO_URI (backend/.env). Make sure that
// is the SAME connection string set on Render, or you'll reset the wrong DB.
// The script prints the DB host/name it connected to so you can confirm.
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../models/User");
const { DEFAULT_LEAVE_BALANCE } = require("./constants");

const [, , emailArg, passwordArg, nameArg] = process.argv;

const email = String(emailArg || "hr@albostech.com").trim().toLowerCase();
const password = String(passwordArg || "Admin@12345").trim();
const name = String(nameArg || "HR Admin").trim();

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("✗ MONGO_URI is not set in backend/.env");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("✗ Password must be at least 6 characters.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(
    `Connected to MongoDB → host=${mongoose.connection.host} db=${mongoose.connection.name}\n`,
  );

  // Need +password because the field is select:false. We overwrite it anyway.
  let user = await User.findOne({ email }).select("+password");

  if (user) {
    user.password = password; // pre('save') hook re-hashes it
    user.role = "hr";
    user.isActive = true;
    user.mustChangePassword = false;
    user.tempPassword = "";
    // Clear any stale reset artefacts so old links/OTPs can't interfere
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.passwordResetOtp = null;
    user.passwordResetOtpExpires = null;
    user.passwordResetVerifiedToken = null;
    user.passwordResetVerifiedExpires = null;
    await user.save();
    console.log(`✓ Updated existing account and reset its password.`);
  } else {
    user = await User.create({
      name,
      email,
      password,
      role: "hr",
      department: "Human Resources",
      designation: "HR Manager",
      position: "HR Manager",
      salary: 0,
      leaveBalance: DEFAULT_LEAVE_BALANCE,
      isActive: true,
      mustChangePassword: false,
    });
    console.log(`✓ Created new HR account (${user.employeeId}).`);
  }

  console.log("\n--- You can now sign in with ---");
  console.log(`  Email / ID : ${user.email}  (or ${user.employeeId})`);
  console.log(`  Password   : ${password}`);
  console.log(`  Role       : ${user.role}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("\n✗ Failed:", err.message);
  if (String(err.message).includes("querySrv") || String(err.message).includes("ENOTFOUND")) {
    console.error(
      "  (DNS could not resolve the Atlas SRV record. Check your internet/DNS, " +
        "or use a standard mongodb:// connection string instead of mongodb+srv://.)",
    );
  }
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
