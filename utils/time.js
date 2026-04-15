function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfDay(value) {
  return normalizeDate(value);
}

function endOfDay(value) {
  const date = normalizeDate(value);
  if (!date) {
    return null;
  }
  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfMonth(year, month) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function endOfMonth(year, month) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function normalizeTime(value) {
  if (value == null || value === "") {
    return "";
  }

  if (value instanceof Date) {
    return [
      String(value.getHours()).padStart(2, "0"),
      String(value.getMinutes()).padStart(2, "0"),
    ].join(":");
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return "";
  }

  const timeMatch = stringValue.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hours = Number.parseInt(timeMatch[1], 10);
    const minutes = Number.parseInt(timeMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(stringValue);
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeTime(parsed);
  }

  return "";
}

function timeToMinutes(value) {
  const time = normalizeTime(value);
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function combineDateAndTime(dateValue, timeValue) {
  const date = normalizeDate(dateValue);
  const time = normalizeTime(timeValue);
  if (!date || !time) {
    return null;
  }

  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function formatDateKey(value) {
  const date = normalizeDate(value);
  if (!date) {
    return "";
  }
  return date.toISOString().split("T")[0];
}

function isSunday(value) {
  const date = normalizeDate(value);
  return date ? date.getDay() === 0 : false;
}

function enumerateDates(startValue, endValue) {
  const start = normalizeDate(startValue);
  const end = normalizeDate(endValue);
  if (!start || !end || start > end) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

module.exports = {
  normalizeDate,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  normalizeTime,
  timeToMinutes,
  combineDateAndTime,
  formatDateKey,
  isSunday,
  enumerateDates,
};
