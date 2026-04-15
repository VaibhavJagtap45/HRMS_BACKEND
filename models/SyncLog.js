const mongoose = require("mongoose");

const syncLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["csv-import", "excel-upload", "manual-sync"],
      default: "excel-upload",
    },
    fileName: {
      type: String,
      default: "",
    },
    recordsFetched: { type: Number, default: 0 },
    recordsInserted: { type: Number, default: 0 },
    recordsSkipped: { type: Number, default: 0 },
    recordsUnmapped: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["success", "partial", "failed"],
      default: "success",
    },
    errorMessage: { type: String, default: "" },
    unmappedIds: [String],
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("SyncLog", syncLogSchema);
