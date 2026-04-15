const mongoose = require("mongoose");
const { normalizeDate } = require("../utils/time");

const leaveSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    leaveType: {
      type: String,
      enum: ["full", "half", "sick", "casual"],
      required: true,
    },
    fromDate: {
      type: Date,
      required: true,
    },
    toDate: {
      type: Date,
      required: true,
    },
    days: {
      type: Number,
      required: true,
      min: 0.5,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    hrComment: {
      type: String,
      default: "",
      maxlength: 500,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "leaves",
  },
);

leaveSchema.pre("validate", function preValidate(next) {
  const fromDate = normalizeDate(this.fromDate);
  const toDate = normalizeDate(this.toDate);
  if (fromDate) {
    this.fromDate = fromDate;
  }
  if (toDate) {
    this.toDate = toDate;
  }
  next();
});

module.exports = mongoose.model("Leave", leaveSchema);
