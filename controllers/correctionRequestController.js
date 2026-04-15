const AttendanceCorrectionRequest = require("../models/AttendanceCorrectionRequest");
const Attendance = require("../models/Attendance");
const { syncAttendanceFromEvents } = require("../utils/attendance");
const { normalizeTime } = require("../utils/time");

const MONTHLY_LIMIT = 10;

// ── Employee: submit a correction request ────────────────────────────────────
// POST /api/attendance/correction-requests
exports.submitRequest = async (req, res) => {
  try {
    const { attendanceId, requestedCheckIn, requestedCheckOut, reason } =
      req.body;

    if (!attendanceId || !reason?.trim()) {
      return res
        .status(400)
        .json({ message: "attendanceId and reason are required." });
    }
    if (!requestedCheckIn && !requestedCheckOut) {
      return res.status(400).json({
        message: "Provide at least one of requestedCheckIn or requestedCheckOut.",
      });
    }

    const record = await Attendance.findById(attendanceId);
    if (!record) {
      return res.status(404).json({ message: "Attendance record not found." });
    }
    if (String(record.employeeId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied." });
    }

    const date = new Date(record.date);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    // Enforce monthly quota
    const usedThisMonth = await AttendanceCorrectionRequest.countDocuments({
      employeeId: req.user._id,
      month,
      year,
    });
    if (usedThisMonth >= MONTHLY_LIMIT) {
      return res.status(429).json({
        message: `You have used all ${MONTHLY_LIMIT} correction requests for this month.`,
      });
    }

    // No duplicate pending request for the same record
    const existing = await AttendanceCorrectionRequest.findOne({
      attendanceId,
      status: "pending",
    });
    if (existing) {
      return res.status(409).json({
        message:
          "A pending correction request already exists for this date. Wait for HR to review it.",
      });
    }

    const request = await AttendanceCorrectionRequest.create({
      employeeId: req.user._id,
      attendanceId,
      date: record.date,
      month,
      year,
      requestedCheckIn: requestedCheckIn ? normalizeTime(requestedCheckIn) : "",
      requestedCheckOut: requestedCheckOut
        ? normalizeTime(requestedCheckOut)
        : "",
      reason: reason.trim(),
    });

    res.status(201).json({
      message: "Correction request submitted successfully.",
      request,
      remaining: MONTHLY_LIMIT - usedThisMonth - 1,
    });
  } catch (err) {
    console.error("submitRequest error:", err);
    res.status(500).json({ message: "Server error." });
  }
};

// ── Employee: get own requests ────────────────────────────────────────────────
// GET /api/attendance/correction-requests/my?month=&year=
exports.getMyRequests = async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = { employeeId: req.user._id };
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);

    const requests = await AttendanceCorrectionRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate("attendanceId", "date checkIn checkOut status")
      .populate("reviewedBy", "name");

    // Also return how many have been used this month
    const now = new Date();
    const m = month ? Number(month) : now.getMonth() + 1;
    const y = year ? Number(year) : now.getFullYear();
    const used = await AttendanceCorrectionRequest.countDocuments({
      employeeId: req.user._id,
      month: m,
      year: y,
    });

    res.json({ requests, used, limit: MONTHLY_LIMIT });
  } catch (err) {
    console.error("getMyRequests error:", err);
    res.status(500).json({ message: "Server error." });
  }
};

// ── HR: list all requests ─────────────────────────────────────────────────────
// GET /api/attendance/correction-requests?status=pending&month=&year=
exports.listRequests = async (req, res) => {
  try {
    const { status, month, year } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);

    const requests = await AttendanceCorrectionRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate("employeeId", "name employeeId department")
      .populate("attendanceId", "date checkIn checkOut status")
      .populate("reviewedBy", "name");

    res.json({ requests });
  } catch (err) {
    console.error("listRequests error:", err);
    res.status(500).json({ message: "Server error." });
  }
};

// ── HR: approve a request ─────────────────────────────────────────────────────
// PUT /api/attendance/correction-requests/:id/approve
exports.approveRequest = async (req, res) => {
  try {
    const request = await AttendanceCorrectionRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request is already reviewed." });
    }

    // Apply corrections to the attendance record
    const record = await Attendance.findById(request.attendanceId);
    if (!record) {
      return res.status(404).json({ message: "Attendance record not found." });
    }

    if (request.requestedCheckIn) record.checkIn = request.requestedCheckIn;
    if (request.requestedCheckOut) record.checkOut = request.requestedCheckOut;

    // Re-sync computed fields (workingHours, status, isLate) from updated times
    syncAttendanceFromEvents(record);
    await record.save();

    request.status = "approved";
    request.hrComment = req.body.hrComment?.trim() || "";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    res.json({ message: "Request approved and attendance updated.", request });
  } catch (err) {
    console.error("approveRequest error:", err);
    res.status(500).json({ message: "Server error." });
  }
};

// ── HR: reject a request ──────────────────────────────────────────────────────
// PUT /api/attendance/correction-requests/:id/reject
exports.rejectRequest = async (req, res) => {
  try {
    const request = await AttendanceCorrectionRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request is already reviewed." });
    }

    request.status = "rejected";
    request.hrComment = req.body.hrComment?.trim() || "";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    res.json({ message: "Request rejected.", request });
  } catch (err) {
    console.error("rejectRequest error:", err);
    res.status(500).json({ message: "Server error." });
  }
};
