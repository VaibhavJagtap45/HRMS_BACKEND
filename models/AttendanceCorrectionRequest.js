const mongoose = require("mongoose");

const correctionRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Null for a "present" regularization request when no attendance record
    // exists for the date yet — the record is created/updated on approval.
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
    },
    // "correction" = fix check-in / check-out times on an existing record.
    // "present"    = ask HR to mark the employee present for the date
    //                (attendance regularization).
    type: {
      type: String,
      enum: ["correction", "present"],
      default: "correction",
    },
    // Regularization reason (only meaningful for "present" requests).
    category: {
      type: String,
      enum: [
        "missed-punch",
        "forgot-punch",
        "wrong-punch",
        "on-duty",
        "wfh",
        "half-day",
        "other",
      ],
      default: "other",
    },
    // Attendance status the day becomes once approved (derived from category).
    outcomeStatus: {
      type: String,
      enum: ["present", "half-day", "wfh", "on-duty"],
      default: "present",
    },
    date: {
      type: Date,
      required: true,
    },
    // Month/year stored for fast quota queries
    month: { type: Number, required: true },
    year: { type: Number, required: true },

    requestedCheckIn: { type: String, default: "" },
    requestedCheckOut: { type: String, default: "" },
    reason: { type: String, required: true, maxlength: 500 },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    hrComment: { type: String, default: "", maxlength: 500 },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One pending request per attendance record at a time
correctionRequestSchema.index({ attendanceId: 1, status: 1 });
correctionRequestSchema.index({ employeeId: 1, month: 1, year: 1 });
// One pending request per employee per date (covers present requests with no record)
correctionRequestSchema.index({ employeeId: 1, date: 1, status: 1 });

module.exports = mongoose.model(
  "AttendanceCorrectionRequest",
  correctionRequestSchema,
);
