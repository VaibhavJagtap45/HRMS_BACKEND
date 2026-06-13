const AttendanceCorrectionRequest = require("../models/AttendanceCorrectionRequest");
const Attendance = require("../models/Attendance");
const Notice = require("../models/Notice");
const { syncAttendanceFromEvents } = require("../utils/attendance");
const { normalizeDate, normalizeTime } = require("../utils/time");
const {
  OFFICE_START_TIME,
  OFFICE_END_TIME,
  REGULARIZATION_CATEGORIES,
  REGULARIZATION_CATEGORY_VALUES,
  REGULARIZATION_OUTCOME_BY_CATEGORY,
  REGULARIZATION_WINDOW_DAYS,
} = require("../utils/constants");

const MONTHLY_LIMIT = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const categoryLabel = (value) =>
  REGULARIZATION_CATEGORIES.find((category) => category.value === value)
    ?.label || "Other";

const formatRequestDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Post an in-app notice to the employee when HR reviews their request.
// Best-effort: a notice failure must never block the approve/reject itself.
async function notifyEmployeeOfDecision(reviewerId, request, decision) {
  try {
    const kind =
      request.type === "present"
        ? "attendance regularization"
        : "attendance correction";
    const title = `Your ${kind} was ${decision}`;
    let body = `Your ${kind} request for ${formatRequestDate(
      request.date,
    )} was ${decision}.`;
    if (decision === "approved" && request.type === "present") {
      body += ` The day is now marked as "${categoryLabel(request.category)}".`;
    }
    if (request.hrComment) {
      body += ` HR note: ${request.hrComment}`;
    }
    await Notice.create({
      title,
      body,
      type: "individual",
      recipient: request.employeeId,
      createdBy: reviewerId,
      readBy: [],
    });
  } catch (err) {
    console.error("notifyEmployeeOfDecision error:", err);
  }
}

// ── Employee: submit a request ───────────────────────────────────────────────
// POST /api/attendance/correction-requests
// Two modes:
//   • type "correction" — fix check-in / check-out times on an EXISTING record
//                         (requires `attendanceId` + at least one requested time)
//   • type "present"    — ask HR to mark the employee present for a `date`
//                         (no attendance record needs to exist yet)
exports.submitRequest = async (req, res) => {
  try {
    const {
      attendanceId,
      date,
      type,
      category,
      requestedCheckIn,
      requestedCheckOut,
      reason,
    } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ message: "A reason is required." });
    }

    const requestType = type === "present" ? "present" : "correction";
    // Validate the regularization reason (only used by "present" requests).
    const requestCategory =
      requestType === "present" &&
      REGULARIZATION_CATEGORY_VALUES.includes(category)
        ? category
        : "other";
    const requestOutcome =
      requestType === "present"
        ? REGULARIZATION_OUTCOME_BY_CATEGORY[requestCategory] || "present"
        : "present";
    let record = null;
    let requestDate = null;

    if (requestType === "correction") {
      if (!attendanceId) {
        return res
          .status(400)
          .json({ message: "attendanceId is required for a time correction." });
      }
      if (!requestedCheckIn && !requestedCheckOut) {
        return res.status(400).json({
          message:
            "Provide at least one of requestedCheckIn or requestedCheckOut.",
        });
      }

      record = await Attendance.findById(attendanceId);
      if (!record) {
        return res
          .status(404)
          .json({ message: "Attendance record not found." });
      }
      if (String(record.employeeId) !== String(req.user._id)) {
        return res.status(403).json({ message: "Access denied." });
      }
      requestDate = normalizeDate(record.date);
    } else {
      // ── Present / regularization request ──────────────────────────────────
      requestDate = normalizeDate(date);
      if (!requestDate) {
        return res
          .status(400)
          .json({ message: "A valid date is required to request present." });
      }

      const today = normalizeDate(new Date());
      if (requestDate > today) {
        return res.status(400).json({
          message: "You cannot request attendance for a future date.",
        });
      }
      const daysAgo = Math.floor((today - requestDate) / MS_PER_DAY);
      if (daysAgo > REGULARIZATION_WINDOW_DAYS) {
        return res.status(400).json({
          message: `You can only regularize attendance within the last ${REGULARIZATION_WINDOW_DAYS} days.`,
        });
      }
      if (requestDate.getDay() === 0) {
        return res
          .status(400)
          .json({ message: "Sunday is a weekly off — no attendance needed." });
      }

      // If a record already exists and the employee is already present, stop.
      record = await Attendance.findOne({
        employeeId: req.user._id,
        date: requestDate,
      });
      if (record && ["present", "late"].includes(record.status)) {
        return res
          .status(409)
          .json({ message: "You are already marked present on this date." });
      }
    }

    const month = requestDate.getMonth() + 1;
    const year = requestDate.getFullYear();

    // Enforce monthly quota
    const usedThisMonth = await AttendanceCorrectionRequest.countDocuments({
      employeeId: req.user._id,
      month,
      year,
    });
    if (usedThisMonth >= MONTHLY_LIMIT) {
      return res.status(429).json({
        message: `You have used all ${MONTHLY_LIMIT} requests for this month.`,
      });
    }

    // No duplicate pending request for the same date
    const existing = await AttendanceCorrectionRequest.findOne({
      employeeId: req.user._id,
      date: requestDate,
      status: "pending",
    });
    if (existing) {
      return res.status(409).json({
        message:
          "A pending request already exists for this date. Wait for HR to review it.",
      });
    }

    const request = await AttendanceCorrectionRequest.create({
      employeeId: req.user._id,
      attendanceId: record?._id || null,
      type: requestType,
      category: requestCategory,
      outcomeStatus: requestOutcome,
      date: requestDate,
      month,
      year,
      requestedCheckIn: requestedCheckIn ? normalizeTime(requestedCheckIn) : "",
      requestedCheckOut: requestedCheckOut
        ? normalizeTime(requestedCheckOut)
        : "",
      reason: reason.trim(),
    });

    res.status(201).json({
      message:
        requestType === "present"
          ? "Attendance request submitted successfully."
          : "Correction request submitted successfully.",
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

    if (request.type === "present") {
      // ── Regularization: find-or-create the day record and mark present ────
      let record = await Attendance.findOne({
        employeeId: request.employeeId,
        date: normalizeDate(request.date),
      });
      if (!record) {
        record = new Attendance({
          employeeId: request.employeeId,
          date: normalizeDate(request.date),
          source: "system",
          createdBy: req.user._id,
          events: [],
        });
      }

      record.checkIn = request.requestedCheckIn || OFFICE_START_TIME;
      record.checkOut = request.requestedCheckOut || OFFICE_END_TIME;
      record.status = "present";
      record.source = "system";
      record.createdBy = req.user._id;
      record.note = `Regularized (${categoryLabel(request.category)}) via employee request`;

      // Re-sync computed fields (workingHours, isLate, and present/late status)
      // from the times, then apply the intended outcome. For a plain "present"
      // outcome we keep sync's present/late call so a late time still counts as
      // late; half-day / WFH / On-Duty override to the chosen status.
      syncAttendanceFromEvents(record);
      const outcome = request.outcomeStatus || "present";
      if (outcome !== "present") {
        record.status = outcome;
      }
      await record.save();
      request.attendanceId = record._id;
    } else {
      // ── Time correction on the existing record ────────────────────────────
      const record = await Attendance.findById(request.attendanceId);
      if (!record) {
        return res
          .status(404)
          .json({ message: "Attendance record not found." });
      }

      if (request.requestedCheckIn) record.checkIn = request.requestedCheckIn;
      if (request.requestedCheckOut) record.checkOut = request.requestedCheckOut;

      // Re-sync computed fields (workingHours, status, isLate) from updated times
      syncAttendanceFromEvents(record);
      await record.save();
    }

    request.status = "approved";
    request.hrComment = req.body.hrComment?.trim() || "";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    await notifyEmployeeOfDecision(req.user._id, request, "approved");

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

    await notifyEmployeeOfDecision(req.user._id, request, "rejected");

    res.json({ message: "Request rejected.", request });
  } catch (err) {
    console.error("rejectRequest error:", err);
    res.status(500).json({ message: "Server error." });
  }
};
