const mongoose = require("mongoose");

const salarySchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
    },
    grossSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    perDaySalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    workingDays: {
      type: Number,
      required: true,
      min: 0,
    },
    sundaysInMonth: {
      type: Number,
      default: 0,
      min: 0,
    },
    swipedDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    daysPresent: {
      type: Number,
      required: true,
      min: 0,
    },
    daysAbsent: {
      type: Number,
      required: true,
      min: 0,
    },
    lateMarks: {
      type: Number,
      required: true,
      min: 0,
    },
    effectiveLateMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    carryForwardLateMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvedLeaveDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    absentDeduction: {
      type: Number,
      required: true,
      min: 0,
    },
    lateDeduction: {
      type: Number,
      required: true,
      min: 0,
    },
    leaveDeduction: {
      type: Number,
      required: true,
      min: 0,
    },
    otherDeductions: {
      type: Number,
      default: 0,
      min: 0,
    },
    pf: {
      type: Number,
      default: 0,
      min: 0,
    },
    pt: {
      type: Number,
      default: 0,
      min: 0,
    },
    pfi: {
      type: Number,
      default: 0,
      min: 0,
    },
    tc: {
      type: Number,
      default: 0,
      min: 0,
    },
    netPayable: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["draft", "finalised"],
      default: "draft",
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "salaries",
  },
);

salarySchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("Salary", salarySchema);
