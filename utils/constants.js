const OFFICE_START_TIME = "10:00";
const OFFICE_END_TIME = "19:00";
const LATE_THRESHOLD_TIME = "10:10";
const DEFAULT_LEAVE_BALANCE = 12;
const DEFAULT_PASSWORD = "changeme123";
const DEFAULT_JWT_EXPIRES_IN = "8h";

// ── Attendance Regularization ────────────────────────────────────────────────
// Reasons an employee can pick when raising a regularization request. The `value`
// is what's stored on the request; `label` is the human-readable text.
const REGULARIZATION_CATEGORIES = [
  { value: "missed-punch", label: "Missed Punch" },
  { value: "forgot-punch", label: "Forgot to Punch" },
  { value: "wrong-punch", label: "Wrong Punch" },
  { value: "on-duty", label: "On Duty" },
  { value: "wfh", label: "Work From Home" },
  { value: "half-day", label: "Half Day" },
  { value: "other", label: "Other" },
];
const REGULARIZATION_CATEGORY_VALUES = REGULARIZATION_CATEGORIES.map(
  (category) => category.value,
);
// Which attendance status a category resolves to once HR approves it.
const REGULARIZATION_OUTCOME_BY_CATEGORY = {
  "missed-punch": "present",
  "forgot-punch": "present",
  "wrong-punch": "present",
  "on-duty": "on-duty",
  wfh: "wfh",
  "half-day": "half-day",
  other: "present",
};
const REGULARIZATION_OUTCOME_VALUES = ["present", "half-day", "wfh", "on-duty"];
// How far back an employee may regularize their attendance (in days).
const REGULARIZATION_WINDOW_DAYS = 30;

module.exports = {
  OFFICE_START_TIME,
  OFFICE_END_TIME,
  LATE_THRESHOLD_TIME,
  DEFAULT_LEAVE_BALANCE,
  DEFAULT_PASSWORD,
  DEFAULT_JWT_EXPIRES_IN,
  REGULARIZATION_CATEGORIES,
  REGULARIZATION_CATEGORY_VALUES,
  REGULARIZATION_OUTCOME_BY_CATEGORY,
  REGULARIZATION_OUTCOME_VALUES,
  REGULARIZATION_WINDOW_DAYS,
};
