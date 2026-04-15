const { LATE_THRESHOLD_TIME } = require("./constants");
const {
  combineDateAndTime,
  normalizeTime,
  timeToMinutes,
} = require("./time");

const LEGACY_EVENT_TYPES = [
  "check-in",
  "check-out",
  "break-out",
  "break-in",
  "overtime-in",
  "overtime-out",
];

const DAILY_STATUSES = [
  "present",
  "absent",
  "late",
  "half-day",
  "holiday",
  "leave",
];

function calculateWorkingHours(checkIn, checkOut) {
  const start = timeToMinutes(checkIn);
  const end = timeToMinutes(checkOut);
  if (start == null || end == null || end <= start) {
    return 0;
  }

  const hours = (end - start) / 60;
  return Number(hours.toFixed(2));
}

function isLateCheckIn(checkIn) {
  const checkInMinutes = timeToMinutes(checkIn);
  const thresholdMinutes = timeToMinutes(LATE_THRESHOLD_TIME);
  if (checkInMinutes == null || thresholdMinutes == null) {
    return false;
  }

  return checkInMinutes > thresholdMinutes;
}

function sortEvents(events = []) {
  return [...events].sort((left, right) => {
    const leftMinutes = timeToMinutes(left.time) ?? 0;
    const rightMinutes = timeToMinutes(right.time) ?? 0;
    return leftMinutes - rightMinutes;
  });
}

function deriveAttendanceStatus(currentStatus, checkIn, checkOut) {
  if (
    !checkIn &&
    !checkOut &&
    ["absent", "holiday", "leave", "half-day"].includes(currentStatus)
  ) {
    return currentStatus;
  }

  if (checkIn && isLateCheckIn(checkIn)) {
    return "late";
  }

  if (checkIn || checkOut) {
    return currentStatus === "half-day" ? "half-day" : "present";
  }

  return "absent";
}

function syncAttendanceFromEvents(attendance) {
  const events = sortEvents(attendance.events || []);
  const primaryInEvent =
    events.find((event) => event.type === "check-in") ||
    events.find((event) => event.type.endsWith("-in")) ||
    null;
  const primaryOutEvent =
    [...events].reverse().find((event) => event.type === "check-out") ||
    [...events].reverse().find((event) => event.type.endsWith("-out")) ||
    null;

  const checkIn = normalizeTime(attendance.checkIn || primaryInEvent?.time);
  const checkOut = normalizeTime(attendance.checkOut || primaryOutEvent?.time);

  attendance.checkIn = checkIn;
  attendance.checkOut = checkOut;
  attendance.workingHours = calculateWorkingHours(checkIn, checkOut);
  attendance.isLate = isLateCheckIn(checkIn);
  attendance.status = deriveAttendanceStatus(attendance.status, checkIn, checkOut);

  return attendance;
}

function upsertEvent(attendance, type, time, payload = {}) {
  const normalizedTime = normalizeTime(time);
  const existingEvent = (attendance.events || []).find((event) => event.type === type);

  if (!normalizedTime) {
    if (existingEvent) {
      attendance.events = attendance.events.filter((event) => event._id?.toString() !== existingEvent._id?.toString());
    }
    return null;
  }

  if (existingEvent) {
    existingEvent.time = normalizedTime;
    if (payload.note !== undefined) {
      existingEvent.note = payload.note;
    }
    if (payload.source) {
      existingEvent.source = payload.source;
    }
    if (payload.createdBy !== undefined) {
      existingEvent.createdBy = payload.createdBy;
    }
    if (payload.rawTimestamp !== undefined) {
      existingEvent.rawTimestamp = payload.rawTimestamp;
    }
    return existingEvent;
  }

  const event = {
    type,
    time: normalizedTime,
    note: payload.note || "",
    source: payload.source || "manual",
    createdBy: payload.createdBy ?? null,
    rawTimestamp: payload.rawTimestamp ?? null,
  };

  attendance.events.push(event);
  return attendance.events[attendance.events.length - 1];
}

function buildLegacyLog(attendance, event, employee) {
  const timestamp = combineDateAndTime(attendance.date, event?.time || attendance.checkIn || "10:00");

  return {
    _id: event?._id || attendance._id,
    attendanceId: attendance._id,
    employee: employee || attendance.employeeId,
    timestamp,
    status: event?.type || attendance.status,
    note: event?.note || attendance.note || "",
    source: event?.source === "manual" ? "manual" : "csv-import",
    rawUserId: employee?.fingerprintId ?? null,
    workingHours: attendance.workingHours,
    attendanceStatus: attendance.status,
    isLate: attendance.isLate,
    checkIn: attendance.checkIn,
    checkOut: attendance.checkOut,
    date: attendance.date,
  };
}

module.exports = {
  LEGACY_EVENT_TYPES,
  DAILY_STATUSES,
  calculateWorkingHours,
  isLateCheckIn,
  sortEvents,
  syncAttendanceFromEvents,
  upsertEvent,
  buildLegacyLog,
};
