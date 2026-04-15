require("dotenv").config();
const User = require("../models/User");
const connectDB = require("../config/db");
const { DEFAULT_LEAVE_BALANCE } = require("../utils/constants");

const HR_EMAIL = "hr@albostech.com";

const sampleEmployees = [
  { employeeId: "ALB001", name: "Rahul Sharma", email: "rahul@albostech.com", department: "Engineering", designation: "Developer", phone: "+91 9000000001", fingerprintId: 1, salary: 35000 },
  { employeeId: "ALB002", name: "Priya Patel", email: "priya@albostech.com", department: "Engineering", designation: "QA Engineer", phone: "+91 9000000002", fingerprintId: 2, salary: 32000 },
  { employeeId: "ALB003", name: "Amit Verma", email: "amit@albostech.com", department: "Sales", designation: "Sales Executive", phone: "+91 9000000003", fingerprintId: 3, salary: 30000 },
  { employeeId: "ALB004", name: "Sneha Joshi", email: "sneha@albostech.com", department: "Marketing", designation: "Designer", phone: "+91 9000000004", fingerprintId: 4, salary: 33000 },
  { employeeId: "ALB005", name: "Rohan Mehta", email: "rohan@albostech.com", department: "Operations", designation: "Ops Lead", phone: "+91 9000000005", fingerprintId: 5, salary: 42000 },
];

const seedData = async () => {
  await connectDB();

  console.log("Seeding database...\n");

  const hrExists = await User.findOne({ email: HR_EMAIL });
  if (!hrExists) {
    await User.create({
      employeeId: "ALB000",
      name: "HR Admin",
      email: HR_EMAIL,
      password: "admin123",
      role: "hr",
      department: "Human Resources",
      designation: "HR Manager",
      position: "HR Manager",
      salary: 0,
      leaveBalance: DEFAULT_LEAVE_BALANCE,
      isActive: true,
      mustChangePassword: false,
    });
    console.log(`Created HR Admin: ${HR_EMAIL} / admin123`);
  } else {
    console.log(`HR Admin already exists: ${HR_EMAIL}`);
  }

  for (const emp of sampleEmployees) {
    const exists = await User.findOne({ email: emp.email });
    if (!exists) {
      try {
        await User.create({
          ...emp,
          password: "employee123",
          role: "employee",
          isActive: true,
          leaveBalance: DEFAULT_LEAVE_BALANCE,
          position: emp.designation,
          doj: new Date("2026-04-01"),
        });
        console.log(`Created employee: ${emp.name} (${emp.email}) - FP ID: ${emp.fingerprintId}`);
      } catch (err) {
        if (err.code === 11000) {
          console.log(`Skipped ${emp.name} - duplicate fingerprintId ${emp.fingerprintId} already exists`);
        } else {
          throw err;
        }
      }
    } else {
      console.log(`${emp.name} already exists`);
    }
  }

  console.log("\nSeeding complete.");
  console.log("\n--- Login Credentials ---");
  console.log(`HR Admin:   ${HR_EMAIL} / admin123`);
  console.log("Employees:  [name]@albostech.com / employee123");

  process.exit(0);
};

seedData().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
