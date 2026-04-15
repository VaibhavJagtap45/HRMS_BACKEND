const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");
const Leave = require("../models/Leave");
const User = require("../models/User");
const { enumerateDates, formatDateKey, normalizeDate } = require("../utils/time");

async function computeLeaveDays(leaveType, fromDate, toDate) {
  if (leaveType === "half") {
    return 0.5;
  }

  const holidays = await Holiday.find({
    date: {
      $gte: normalizeDate(fromDate),
      $lte: normalizeDate(toDate),
    },
  }).lean();
  const holidaySet = new Set(holidays.map((holiday) => formatDateKey(holiday.date)));

  return enumerateDates(fromDate, toDate).filter((date) => {
    const isSunday = date.getDay() === 0;
    const isHoliday = holidaySet.has(formatDateKey(date));
    return !isSunday && !isHoliday;
  }).length;
}

async function markLeaveOnAttendance(leave, reviewerId) {
  const holidays = await Holiday.find({
    date: {
      $gte: normalizeDate(leave.fromDate),
      $lte: normalizeDate(leave.toDate),
    },
  }).lean();
  const holidaySet = new Set(holidays.map((holiday) => formatDateKey(holiday.date)));
  const dates = (
    leave.leaveType === "half"
      ? [normalizeDate(leave.fromDate)]
      : enumerateDates(leave.fromDate, leave.toDate)
  ).filter((date) => {
    if (leave.leaveType === "half") {
      return true;
    }
    return date.getDay() !== 0 && !holidaySet.has(formatDateKey(date));
  });

  for (const date of dates) {
    let attendance = await Attendance.findOne({
      employeeId: leave.employeeId,
      date: normalizeDate(date),
    });

    if (!attendance) {
      attendance = new Attendance({
        employeeId: leave.employeeId,
        date: normalizeDate(date),
        source: "system",
        createdBy: reviewerId,
        note: `Approved ${leave.leaveType} leave`,
        events: [],
      });
    }

    attendance.status = leave.leaveType === "half" ? "half-day" : "leave";
    attendance.source = "system";
    attendance.createdBy = reviewerId;
    attendance.note = `Approved ${leave.leaveType} leave`;
    attendance.checkIn = "";
    attendance.checkOut = "";
    attendance.workingHours = 0;
    attendance.isLate = false;
    attendance.events = [];
    await attendance.save();
  }
}

async function listLeaves(req, res) {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.employeeId) query.employeeId = req.query.employeeId;

    const leaves = await Leave.find(query)
      .populate("employeeId", "employeeId name email department designation")
      .populate("reviewedBy", "employeeId name email")
      .sort({ createdAt: -1 });

    return res.json({ leaves });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function listMyLeaves(req, res) {
  try {
    const leaves = await Leave.find({ employeeId: req.user._id })
      .populate("reviewedBy", "employeeId name email")
      .sort({ createdAt: -1 });

    return res.json({ leaves });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function applyLeave(req, res) {
  try {
    const { leaveType, fromDate, toDate, reason } = req.body;

    if (!leaveType || !fromDate || !toDate || !reason) {
      return res.status(400).json({ message: "leaveType, fromDate, toDate, and reason are required." });
    }

    const employee = await User.findById(req.user._id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const days = await computeLeaveDays(leaveType, fromDate, toDate);
    if (days <= 0) {
      return res.status(400).json({ message: "Selected dates do not contain any valid leave days." });
    }

    const pendingLeaves = await Leave.find({
      employeeId: req.user._id,
      status: "pending",
    }).lean();
    const pendingDays = pendingLeaves.reduce((total, leave) => total + Number(leave.days || 0), 0);

    if (days > employee.leaveBalance - pendingDays) {
      return res.status(400).json({ message: "Insufficient leave balance for this request." });
    }

    const leave = await Leave.create({
      employeeId: req.user._id,
      leaveType,
      fromDate,
      toDate,
      days,
      reason,
      status: "pending",
    });

    return res.status(201).json({
      leave,
      message: "Leave request submitted successfully.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function approveLeave(req, res) {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ message: "Leave request not found." });
    }
    if (leave.status !== "pending") {
      return res.status(400).json({ message: "Only pending leave requests can be approved." });
    }

    const employee = await User.findById(leave.employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }
    if (employee.leaveBalance < leave.days) {
      return res.status(400).json({ message: "Employee no longer has sufficient leave balance." });
    }

    employee.leaveBalance = Number((employee.leaveBalance - leave.days).toFixed(2));
    await employee.save();

    leave.status = "approved";
    leave.hrComment = req.body.comment || "";
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    await leave.save();

    await markLeaveOnAttendance(leave, req.user._id);

    return res.json({
      leave,
      message: "Leave request approved successfully.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function rejectLeave(req, res) {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ message: "Leave request not found." });
    }
    if (leave.status !== "pending") {
      return res.status(400).json({ message: "Only pending leave requests can be rejected." });
    }

    leave.status = "rejected";
    leave.hrComment = req.body.comment || "";
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    await leave.save();

    return res.json({
      leave,
      message: "Leave request rejected successfully.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function cancelLeave(req, res) {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ message: "Leave request not found." });
    }
    if (leave.employeeId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only cancel your own leave request." });
    }
    if (leave.status !== "pending") {
      return res.status(400).json({ message: "Only pending leave requests can be cancelled." });
    }

    await Leave.deleteOne({ _id: leave._id });
    return res.json({ message: "Leave request cancelled successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

module.exports = {
  listLeaves,
  listMyLeaves,
  applyLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
};
