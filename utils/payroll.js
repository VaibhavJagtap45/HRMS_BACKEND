const { enumerateDates, formatDateKey, isSunday, startOfMonth, endOfMonth } = require("./time");

const DEFAULT_SALARY = 10000;
const HALF_DAY_HOURS_THRESHOLD = 5; // < 5 hrs worked → counted as half-day
const LATE_MARKS_PER_LEAVE = 3;     // 3 late marks = 1 leave deduction
const DEFAULT_PT = 200;             // Professional Tax fixed deduction (₹200/month)

/**
 * Count total payable days in a month.
 * Company policy: Sundays are PAID days — every calendar day is a working day
 * except registered company holidays.
 */
function countWorkingDays(year, month, holidays = []) {
  const start = startOfMonth(year, month);
  const end   = endOfMonth(year, month);
  const holidaySet = new Set(holidays.map((h) => formatDateKey(h.date || h)));

  let workingDays = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (!holidaySet.has(formatDateKey(cursor))) {
      workingDays++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return workingDays;
}

/**
 * Count how many Sundays fall in a given month.
 * Sundays are automatically credited as paid days (employees don't need to
 * swipe in on Sundays for those days to count toward their salary).
 */
function countSundaysInMonth(year, month) {
  const start = startOfMonth(year, month);
  const end   = endOfMonth(year, month);
  let sundays = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isSunday(cursor)) sundays++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return sundays;
}

/**
 * Resolve how many days to credit for a single attendance record.
 *
 * Rules:
 *   - "half-day" status → 0.5
 *   - "present" / "late" with workingHours > 0 and < 5 → 0.5 (auto half-day)
 *   - "present" / "late" otherwise → 1.0
 *   - absent / holiday / leave → 0
 */
function resolveAttendanceCredit(record) {
  if (record.status === "half-day") return 0.5;

  if (["present", "late"].includes(record.status)) {
    const hours = Number(record.workingHours || 0);
    if (hours > 0 && hours < HALF_DAY_HOURS_THRESHOLD) return 0.5;
    return 1;
  }

  return 0;
}

function calculatePayrollBreakdown({
  employee,
  attendanceRecords = [],
  approvedLeaves = [],
  holidays = [],
  carryForwardLateMarks = 0,
  otherDeductions = 0,
  pf  = 0,
  pt  = DEFAULT_PT,   // ₹200 Professional Tax by default
  pfi = 0,
  tc  = 0,
  month,
  year,
}) {
  const grossSalary = Number(employee.salary || DEFAULT_SALARY);

  // Total payable days = all calendar days in month minus registered holidays.
  // Sundays ARE included because the company pays for Sundays.
  const workingDays = countWorkingDays(year, month, holidays);

  // Per-day rate based on total paid days
  const perDaySalary = workingDays > 0 ? grossSalary / workingDays : 0;

  // ── Attendance credits ────────────────────────────────────────────────────
  // Sunday attendance records are auto-created by payrollController before this
  // function is called, so Sundays are already included in attendanceRecords.
  const lateMarks  = attendanceRecords.filter((r) => r.status === "late").length;
  const swipedDays = attendanceRecords.reduce(
    (total, rec) => total + resolveAttendanceCredit(rec),
    0,
  );

  // Count Sundays for display/reporting only (they're already in swipedDays)
  const sundaysInMonth = countSundaysInMonth(year, month);

  // daysPresent = all credited attendance including auto-created Sundays
  const daysPresent = Number(swipedDays.toFixed(2));

  // ── Approved leave days (count weekdays only; Sundays are already credited) ─
  const monthStart  = startOfMonth(year, month);
  const monthEnd    = endOfMonth(year, month);
  const holidaySet  = new Set(holidays.map((h) => formatDateKey(h.date || h)));

  const approvedLeaveDays = approvedLeaves.reduce((total, leave) => {
    if (leave.leaveType === "half") {
      const leaveDate = leave.fromDate || leave.toDate;
      if (leaveDate >= monthStart && leaveDate <= monthEnd) return total + 0.5;
      return total;
    }
    const overlapDays = enumerateDates(leave.fromDate, leave.toDate).filter((date) => {
      const inMonth = date >= monthStart && date <= monthEnd;
      // Exclude Sundays from leave count (they're already paid as a perk)
      return inMonth && !isSunday(date) && !holidaySet.has(formatDateKey(date));
    }).length;
    return total + overlapDays;
  }, 0);

  // Absent days = total paid days − present (incl. Sundays) − approved leaves
  const daysAbsent = Number(
    Math.max(workingDays - daysPresent - approvedLeaveDays, 0).toFixed(2),
  );

  // ── Late-mark deductions ─────────────────────────────────────────────────
  const effectiveLateMarks     = carryForwardLateMarks + lateMarks;
  const lateDeductionDays      = Math.floor(effectiveLateMarks / LATE_MARKS_PER_LEAVE);
  const carryForwardLateRemainder = effectiveLateMarks % LATE_MARKS_PER_LEAVE;

  // ── Monetary deductions ─────────────────────────────────────────────────
  const absentDeduction        = Number((daysAbsent        * perDaySalary).toFixed(2));
  const lateDeduction          = Number((lateDeductionDays * perDaySalary).toFixed(2));
  const leaveDeduction         = 0;
  const sanitizedOtherDeductions = Number(Number(otherDeductions || 0).toFixed(2));
  const sanitizedPf  = Number(Number(pf  || 0).toFixed(2));
  const sanitizedPt  = Number(Number(pt  ?? DEFAULT_PT).toFixed(2));
  const sanitizedPfi = Number(Number(pfi || 0).toFixed(2));
  const sanitizedTc  = Number(Number(tc  || 0).toFixed(2));

  const totalDeductions =
    absentDeduction + lateDeduction + leaveDeduction +
    sanitizedOtherDeductions + sanitizedPf + sanitizedPt + sanitizedPfi + sanitizedTc;

  const netPayable = Number(Math.max(0, grossSalary - totalDeductions).toFixed(2));

  return {
    grossSalary:              Number(grossSalary.toFixed(2)),
    perDaySalary:             Number(perDaySalary.toFixed(2)),
    workingDays,
    sundaysInMonth,
    daysPresent,
    swipedDays:               Number(swipedDays.toFixed(2)),
    daysAbsent,
    approvedLeaveDays:        Number(approvedLeaveDays.toFixed(2)),
    lateMarks,
    effectiveLateMarks,
    carryForwardLateRemainder,
    absentDeduction,
    lateDeduction,
    leaveDeduction,
    otherDeductions:          sanitizedOtherDeductions,
    pf:                       sanitizedPf,
    pt:                       sanitizedPt,
    pfi:                      sanitizedPfi,
    tc:                       sanitizedTc,
    netPayable,
  };
}

module.exports = {
  DEFAULT_PT,
  countWorkingDays,
  countSundaysInMonth,
  calculatePayrollBreakdown,
};
