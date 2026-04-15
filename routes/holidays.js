const express = require("express");
const holidayController = require("../controllers/holidayController");
const { authorize, protect } = require("../middleware/authGuard");

const router = express.Router();

router.use(protect);

router.get("/", holidayController.listHolidays);
router.post("/", authorize("hr"), holidayController.createHoliday);
router.put("/:id", authorize("hr"), holidayController.updateHoliday);
router.delete("/:id", authorize("hr"), holidayController.deleteHoliday);

module.exports = router;
