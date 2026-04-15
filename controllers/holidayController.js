const Holiday = require("../models/Holiday");
const { endOfMonth, startOfMonth } = require("../utils/time");

async function listHolidays(req, res) {
  try {
    const query = {};
    if (req.query.month && req.query.year) {
      query.date = {
        $gte: startOfMonth(Number(req.query.year), Number(req.query.month)),
        $lte: endOfMonth(Number(req.query.year), Number(req.query.month)),
      };
    }

    const holidays = await Holiday.find(query)
      .populate("createdBy", "employeeId name email")
      .sort({ date: 1 });

    return res.json({ holidays });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function createHoliday(req, res) {
  try {
    const { name, date, type } = req.body;
    if (!name || !date || !type) {
      return res.status(400).json({ message: "name, date, and type are required." });
    }

    const holiday = await Holiday.create({
      name,
      date,
      type,
      createdBy: req.user._id,
    });

    await holiday.populate("createdBy", "employeeId name email");
    return res.status(201).json({
      holiday,
      message: "Holiday created successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A holiday already exists for this date." });
    }
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function updateHoliday(req, res) {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ message: "Holiday not found." });
    }

    if (req.body.name !== undefined) holiday.name = req.body.name;
    if (req.body.date !== undefined) holiday.date = req.body.date;
    if (req.body.type !== undefined) holiday.type = req.body.type;
    await holiday.save();
    await holiday.populate("createdBy", "employeeId name email");

    return res.json({
      holiday,
      message: "Holiday updated successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A holiday already exists for this date." });
    }
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function deleteHoliday(req, res) {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ message: "Holiday not found." });
    }

    await Holiday.deleteOne({ _id: holiday._id });
    return res.json({ message: "Holiday deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

module.exports = {
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
};
