const express = require("express");
const attendanceController = require("../controllers/attendanceController");
const correctionRequestController = require("../controllers/correctionRequestController");
const { authorize, protect } = require("../middleware/authGuard");

const router = express.Router();

// All routes require a valid JWT
router.use(protect);

// ── HR: Manual & bulk operations ─────────────────────────────────────────────

// POST /api/v1/attendance/manual  — Add a single punch entry (HR only)
router.post(
  "/manual",
  authorize("hr"),
  attendanceController.createManualAttendance,
);

// POST /api/v1/attendance/bulk-upload  — Standard Excel/CSV bulk import (HR only)
// Expects columns: Employee ID/Name/Email, Date, Check In, Check Out
// (or timestamp + direction for fingerprint-style punch logs)
router.post(
  "/bulk-upload",
  authorize("hr"),
  attendanceController.attendanceUpload.single("file"),
  attendanceController.bulkUploadAttendance,
);

// POST /api/v1/attendance/import-csv  — Legacy CSV import alias (HR only)
router.post(
  "/import-csv",
  authorize("hr"),
  attendanceController.attendanceUpload.single("file"),
  attendanceController.legacyImportCsv,
);

// POST /api/v1/attendance/monthly-upload — Monthly pivot-table Excel import (HR only)
// Format: header row = "Emp Code | Emp Name | 1 | 2 | … | 31"
//         Each employee occupies 2 consecutive rows (check-in row + check-out row)
// Body params required: month (1-12), year (YYYY)
router.post(
  "/monthly-upload",
  authorize("hr"),
  attendanceController.attendanceUpload.single("file"),
  attendanceController.monthlyUploadAttendance,
);

// POST /api/v1/attendance/daily-upload — Biometric daily detailed XLS import (HR only)
// Format: "Date wise Daily Attendance Report (Detailed)" from fingerprint / ESSL devices
//         Header row contains: EMP Code | Card No | Emp Name | In Time | Out Time | Status
//         In Time / Out Time are full datetime strings (e.g. "2026-04-06 09:51:00")
//         Status values: P = Present, MIS = Missing check-out, A = Absent, WO = Weekend Off
// The date is auto-detected from the In Time column — no extra body params needed.
router.post(
  "/daily-upload",
  authorize("hr"),
  attendanceController.attendanceUpload.single("file"),
  attendanceController.dailyDetailedUpload,
);

// ── Read-only reporting ───────────────────────────────────────────────────────

// GET /api/v1/attendance/daily          — Daily punch log (HR: all; Employee: own)
router.get("/daily", attendanceController.legacyDailyReport);

// GET /api/v1/attendance/history/:employeeId — Per-employee punch history
router.get("/history/:employeeId", attendanceController.legacyHistory);

// GET /api/v1/attendance/import-logs   — Excel/CSV import audit trail (HR only)
router.get("/import-logs", authorize("hr"), attendanceController.getImportLogs);

// GET /api/v1/attendance/stats         — Attendance summary stats
router.get("/stats", attendanceController.getAttendanceStats);

// GET /api/v1/attendance/my/:month/:year — Employee's own monthly calendar data
router.get("/my/:month/:year", attendanceController.getMyMonthlyAttendance);

// ── CRUD on daily attendance records ─────────────────────────────────────────

// GET /api/v1/attendance                — List records (HR: filterable; Employee: own)
router.get("/", attendanceController.listAttendance);

// POST /api/v1/attendance               — Create a daily attendance record (HR only)
router.post("/", authorize("hr"), attendanceController.createAttendanceRecord);

// PUT /api/v1/attendance/:id            — Update a record or event (HR only)
router.put(
  "/:id",
  authorize("hr"),
  attendanceController.updateAttendanceRecord,
);

// DELETE /api/v1/attendance/:id         — Delete a record or event (HR only)
router.delete(
  "/:id",
  authorize("hr"),
  attendanceController.deleteAttendanceRecord,
);

// ── Correction Requests ───────────────────────────────────────────────────────

// POST   /api/v1/attendance/correction-requests          — Employee submits request
router.post("/correction-requests", correctionRequestController.submitRequest);

// GET    /api/v1/attendance/correction-requests/my       — Employee views own requests
router.get(
  "/correction-requests/my",
  correctionRequestController.getMyRequests,
);

// GET    /api/v1/attendance/correction-requests          — HR lists all requests
router.get(
  "/correction-requests",
  authorize("hr"),
  correctionRequestController.listRequests,
);

// PUT    /api/v1/attendance/correction-requests/:id/approve — HR approves
router.put(
  "/correction-requests/:id/approve",
  authorize("hr"),
  correctionRequestController.approveRequest,
);

// PUT    /api/v1/attendance/correction-requests/:id/reject  — HR rejects
router.put(
  "/correction-requests/:id/reject",
  authorize("hr"),
  correctionRequestController.rejectRequest,
);

module.exports = router;
