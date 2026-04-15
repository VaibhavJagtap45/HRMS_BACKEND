const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { DEFAULT_LEAVE_BALANCE } = require("../utils/constants");

async function generateEmployeeId() {
  const existingUsers = await mongoose
    .model("User")
    .find({ employeeId: /^ALB\d+$/ })
    .select("employeeId")
    .lean();

  const maxNumber = existingUsers.reduce((maxValue, user) => {
    const numericPart = Number.parseInt(String(user.employeeId).replace(/^ALB/, ""), 10);
    if (Number.isNaN(numericPart)) {
      return maxValue;
    }
    return Math.max(maxValue, numericPart);
  }, 0);

  return `ALB${String(maxNumber + 1).padStart(3, "0")}`;
}

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["hr", "employee"],
      default: "employee",
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    position: {
      type: String,
      trim: true,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    salary: {
      type: Number,
      default: 0,
      min: 0,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    doj: {
      type: Date,
      default: Date.now,
    },
    profilePic: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    fingerprintId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    leaveBalance: {
      type: Number,
      default: DEFAULT_LEAVE_BALANCE,
      min: 0,
    },
    lateMarkCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    // Last password set by HR in plaintext, so HR can view/communicate it.
    // Cleared to '' when the employee changes their own password.
    tempPassword: {
      type: String,
      default: '',
    },
    // Bank details
    bankName: {
      type: String,
      trim: true,
      default: '',
    },
    bankAccountNo: {
      type: String,
      trim: true,
      default: '',
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    branchName: {
      type: String,
      trim: true,
      default: '',
    },
    // Password reset token (SHA-256 hashed before storage)
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    // Token expiry timestamp
    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
    // OTP-based password reset
    passwordResetOtp: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetOtpExpires: {
      type: Date,
      default: null,
      select: false,
    },
    // After OTP verified — short-lived token to allow the actual reset call
    passwordResetVerifiedToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetVerifiedExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("validate", async function preValidate(next) {
  if (!this.employeeId) {
    this.employeeId = await generateEmployeeId();
  }

  if (!this.designation && this.position) {
    this.designation = this.position;
  }

  if (!this.position && this.designation) {
    this.position = this.designation;
  }

  if (!this.profilePic && this.avatar) {
    this.profilePic = this.avatar;
  }

  if (!this.avatar && this.profilePic) {
    this.avatar = this.profilePic;
  }

  next();
});

userSchema.pre("save", async function preSave(next) {
  if (!this.isModified("password")) {
    return next();
  }

  const saltRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
  const salt = await bcrypt.genSalt(Number.isNaN(saltRounds) ? 10 : saltRounds);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
