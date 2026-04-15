const express = require("express");
const leaveController = require("../controllers/leaveController");
const { authorize, protect } = require("../middleware/authGuard");

const router = express.Router();

router.use(protect);

router.get("/", authorize("hr"), leaveController.listLeaves);
router.get("/my", leaveController.listMyLeaves);
router.post("/", authorize("employee", "hr"), leaveController.applyLeave);
router.put("/:id/approve", authorize("hr"), leaveController.approveLeave);
router.put("/:id/reject", authorize("hr"), leaveController.rejectLeave);
router.delete("/:id", authorize("employee", "hr"), leaveController.cancelLeave);

module.exports = router;
