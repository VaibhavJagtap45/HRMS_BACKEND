const mongoose = require("mongoose");
const { normalizeDate, normalizeTime } = require("../utils/time");

const attendanceEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "check-in",
        "check-out",
        "break-out",
        "break-in",
        "overtime-in",
        "overtime-out",
      ],
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      default: "",
      maxlength: 300,
    },
    source: {
      type: String,
      enum: ["manual", "excel", "system"],
      default: "manual",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rawTimestamp: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    checkIn: {
      type: String,
      default: "",
    },
    checkOut: {
      type: String,
      default: "",
    },
    workingHours: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["present", "absent", "late", "half-day", "holiday", "leave"],
      default: "absent",
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      enum: ["manual", "excel", "system"],
      default: "manual",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    note: {
      type: String,
      default: "",
      maxlength: 500,
    },
    rawEmployeeCode: {
      type: String,
      default: "",
    },
    events: [attendanceEventSchema],
  },
  {
    timestamps: true,
    collection: "attendance",
  },
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

attendanceSchema.pre("validate", function preValidate(next) {
  const normalizedDate = normalizeDate(this.date);
  if (normalizedDate) {
    this.date = normalizedDate;
  }

  this.checkIn = normalizeTime(this.checkIn);
  this.checkOut = normalizeTime(this.checkOut);
  (this.events || []).forEach((event) => {
    event.time = normalizeTime(event.time);
  });

  next();
});

module.exports = mongoose.model("Attendance", attendanceSchema);
