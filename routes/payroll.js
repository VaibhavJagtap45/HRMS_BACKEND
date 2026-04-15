const express = require("express");
const payrollController = require("../controllers/payrollController");
const { authorize, protect } = require("../middleware/authGuard");

const router = express.Router();

router.use(protect);

router.post("/generate", authorize("hr"), payrollController.generatePayroll);
router.get("/attendance-check", authorize("hr"), payrollController.attendanceCheck);
router.get("/", authorize("hr"), payrollController.listPayroll);
router.put("/:id", authorize("hr"), payrollController.editPayroll);
router.put("/:id/finalise", authorize("hr"), payrollController.finalisePayroll);
router.get("/my/:month/:year", authorize("employee", "hr"), payrollController.getMySalarySlip);

module.exports = router;
