const mongoose = require("mongoose");

const correctionRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: true,
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

module.exports = mongoose.model(
  "AttendanceCorrectionRequest",
  correctionRequestSchema,
);
