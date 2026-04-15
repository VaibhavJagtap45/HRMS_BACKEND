const Notice = require("../models/Notice");

async function listNotices(req, res) {
  try {
    const notices = await Notice.find()
      .populate("createdBy", "employeeId name email")
      .populate("recipient", "employeeId name email")
      .sort({ createdAt: -1 });

    const enriched = notices.map((notice) => {
      const plainNotice = notice.toObject();
      plainNotice.readCount = plainNotice.readBy?.length || 0;
      return plainNotice;
    });

    return res.json({ notices: enriched });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function createNotice(req, res) {
  try {
    const { title, body, type, recipient } = req.body;
    if (!title || !body || !type) {
      return res.status(400).json({ message: "title, body, and type are required." });
    }
    if (type === "individual" && !recipient) {
      return res.status(400).json({ message: "recipient is required for individual notices." });
    }

    const notice = await Notice.create({
      title,
      body,
      type,
      recipient: type === "individual" ? recipient : null,
      createdBy: req.user._id,
      readBy: [],
    });

    await notice.populate("createdBy", "employeeId name email");
    await notice.populate("recipient", "employeeId name email");

    return res.status(201).json({
      notice,
      message: "Notice created successfully.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function deleteNotice(req, res) {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ message: "Notice not found." });
    }

    await Notice.deleteOne({ _id: notice._id });
    return res.json({ message: "Notice deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function listMyNotices(req, res) {
  try {
    const notices = await Notice.find({
      $or: [{ type: "global" }, { type: "individual", recipient: req.user._id }],
    })
      .populate("createdBy", "employeeId name email")
      .sort({ createdAt: -1 });

    const userId = req.user._id.toString();
    const enriched = notices.map((notice) => {
      const plainNotice = notice.toObject();
      plainNotice.isRead = plainNotice.readBy.some((readerId) => readerId.toString() === userId);
      return plainNotice;
    });

    // Badge count — number of notices the employee hasn't opened yet
    const unreadCount = enriched.filter((notice) => !notice.isRead).length;

    return res.json({ notices: enriched, unreadCount });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function markNoticeRead(req, res) {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ message: "Notice not found." });
    }

    const isVisible =
      notice.type === "global" ||
      (notice.type === "individual" && notice.recipient?.toString() === req.user._id.toString());
    if (!isVisible) {
      return res.status(403).json({ message: "Not authorized to read this notice." });
    }

    if (!notice.readBy.some((readerId) => readerId.toString() === req.user._id.toString())) {
      notice.readBy.push(req.user._id);
      await notice.save();
    }

    return res.json({ message: "Notice marked as read." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

module.exports = {
  listNotices,
  createNotice,
  deleteNotice,
  listMyNotices,
  markNoticeRead,
};
