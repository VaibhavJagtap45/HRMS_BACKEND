const mongoose = require("mongoose");
const { normalizeDate } = require("../utils/time");

const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    date: {
      type: Date,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["national", "company"],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "holidays",
  },
);

holidaySchema.pre("validate", function preValidate(next) {
  const date = normalizeDate(this.date);
  if (date) {
    this.date = date;
  }
  next();
});

module.exports = mongoose.model("Holiday", holidaySchema);
