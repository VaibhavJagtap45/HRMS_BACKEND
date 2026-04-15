const express = require("express");
const noticeController = require("../controllers/noticeController");
const { authorize, protect } = require("../middleware/authGuard");

const router = express.Router();

router.use(protect);

router.get("/", authorize("hr"), noticeController.listNotices);
router.post("/", authorize("hr"), noticeController.createNotice);
router.delete("/:id", authorize("hr"), noticeController.deleteNotice);
router.get("/my", noticeController.listMyNotices);
router.put("/:id/read", noticeController.markNoticeRead);

module.exports = router;
