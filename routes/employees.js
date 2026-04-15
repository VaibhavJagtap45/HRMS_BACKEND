// const express = require("express");
// const employeeController = require("../controllers/employeeController");
// const { authorize, protect } = require("../middleware/authGuard");

// const router = express.Router();

// // All routes require a valid JWT
// router.use(protect);

// // Static paths must be registered BEFORE /:id to avoid param collision
// router.get("/departments", employeeController.getDepartments);
// router.get("/stats", authorize("hr"), employeeController.getStats);
// router.get("/me", employeeController.getOwnProfile);
// router.put("/me", employeeController.updateOwnProfile);

// // Collection-level routes
// router.get("/", employeeController.listEmployees);                        // HR: all; Employee: own record
// router.post("/", authorize("hr"), employeeController.createEmployee);     // HR only

// // Resource-level routes
// router.get("/:id", employeeController.getEmployeeById);                   // HR: any; Employee: own
// router.put("/:id", authorize("hr"), employeeController.updateEmployee);   // HR only
// router.delete("/:id", authorize("hr"), employeeController.softDeleteEmployee); // HR only (soft-delete)

// module.exports = router;

const express = require("express");
const employeeController = require("../controllers/employeeController");
const { authorize, protect } = require("../middleware/authGuard");

const router = express.Router();

// All routes require a valid JWT
router.use(protect);

// Static paths must be registered BEFORE /:id to avoid param collision
router.get("/departments", employeeController.getDepartments);
router.get("/stats", authorize("hr"), employeeController.getStats);
router.get("/me", employeeController.getOwnProfile);
router.put("/me", employeeController.updateOwnProfile);

// Bulk employee import from Excel/CSV (HR only)
// POST /api/v1/employees/bulk-upload  — form-data field: file
router.post(
  "/bulk-upload",
  authorize("hr"),
  employeeController.employeeUpload.single("file"),
  employeeController.bulkCreateEmployees,
);

// Collection-level routes
router.get("/", employeeController.listEmployees); // HR: all; Employee: own record
router.post("/", authorize("hr"), employeeController.createEmployee); // HR only

// Resource-level routes
router.get("/:id", employeeController.getEmployeeById);                               // HR: any; Employee: own
router.put("/:id", authorize("hr"), employeeController.updateEmployee);               // HR only
router.post("/:id/reset-password", authorize("hr"), employeeController.resetEmployeePassword); // HR only
router.delete("/:id", authorize("hr"), employeeController.softDeleteEmployee);        // HR only (soft-delete)

module.exports = router;
