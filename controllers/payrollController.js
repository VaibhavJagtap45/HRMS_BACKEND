const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");
const Leave = require("../models/Leave");
const Salary = require("../models/Salary");
const User = require("../models/User");
const { calculatePayrollBreakdown, DEFAULT_PT } = require("../utils/payroll");
const { endOfMonth, isSunday, normalizeDate, startOfMonth } = require("../utils/time");

/**
 * Auto-insert a "present" attendance record for every Sunday in the month
 * that does not already have an attendance entry for the given employee.
 * Sundays are a paid company policy — employees don't swipe but they're credited.
 */
async function autoCreateSundayAttendance(employeeId, year, month) {
  const start = startOfMonth(year, month);
  const end   = endOfMonth(year, month);
  const cursor = new Date(start);

  while (cursor <= end) {
    if (isSunday(cursor)) {
      const sundayDate = normalizeDate(new Date(cursor));
      // Only insert if no record exists — never overwrite HR-entered data
      await Attendance.findOneAndUpdate(
        { employeeId, date: sundayDate },
        {
          $setOnInsert: {
            employeeId,
            date:   sundayDate,
            status: "present",
            source: "system",
            note:   "Sunday – auto-credited (company paid day)",
            events: [],
          },
        },
        { upsert: true },
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

async function buildPayrollForEmployee({ employee, month, year, generatedBy, otherDeductions = 0, pf = 0, pt = DEFAULT_PT, pfi = 0, tc = 0 }) {
  // Auto-create "present" records for every Sunday before we fetch attendance.
  // This ensures Sundays flow through the normal attendance credit path rather
  // than being added as a separate offset, giving accurate "actual working days".
  await autoCreateSundayAttendance(employee._id, year, month);

  const dateRange = {
    $gte: startOfMonth(year, month),
    $lte: endOfMonth(year, month),
  };

  const [attendanceRecords, approvedLeaves, holidays] = await Promise.all([
    Attendance.find({ employeeId: employee._id, date: dateRange }).lean(),
    Leave.find({
      employeeId: employee._id,
      status: "approved",
      fromDate: { $lte: dateRange.$lte },
      toDate: { $gte: dateRange.$gte },
    }).lean(),
    Holiday.find({ date: dateRange }).lean(),
  ]);

  const breakdown = calculatePayrollBreakdown({
    employee,
    attendanceRecords,
    approvedLeaves,
    holidays,
    carryForwardLateMarks: Number(employee.lateMarkCount || 0),
    otherDeductions,
    pf,
    pt,
    pfi,
    tc,
    month,
    year,
  });

  return Salary.findOneAndUpdate(
    { employeeId: employee._id, month, year },
    {
      employeeId: employee._id,
      month,
      year,
      grossSalary: breakdown.grossSalary,
      perDaySalary: breakdown.perDaySalary,
      workingDays: breakdown.workingDays,
      sundaysInMonth: breakdown.sundaysInMonth,
      swipedDays: breakdown.swipedDays,
      daysPresent: breakdown.daysPresent,
      daysAbsent: breakdown.daysAbsent,
      lateMarks: breakdown.lateMarks,
      effectiveLateMarks: breakdown.effectiveLateMarks,
      carryForwardLateMarks: breakdown.carryForwardLateRemainder,
      approvedLeaveDays: breakdown.approvedLeaveDays,
      absentDeduction: breakdown.absentDeduction,
      lateDeduction: breakdown.lateDeduction,
      leaveDeduction: breakdown.leaveDeduction,
      otherDeductions: breakdown.otherDeductions,
      pf: breakdown.pf,
      pt: breakdown.pt,
      pfi: breakdown.pfi,
      tc: breakdown.tc,
      netPayable: breakdown.netPayable,
      generatedBy,
      generatedAt: new Date(),
      status: "draft",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).populate("employeeId", "employeeId name email department designation position salary doj");
}

async function generatePayroll(req, res) {
  try {
    const month = Number.parseInt(req.body.month, 10);
    const year = Number.parseInt(req.body.year, 10);
    const employeeId = req.body.employeeId || null;
    const otherDeductions = Number(req.body.otherDeductions || 0);
    const pf  = Number(req.body.pf  || 0);
    const pt  = req.body.pt !== undefined ? Number(req.body.pt) : DEFAULT_PT;
    const pfi = Number(req.body.pfi || 0);
    const tc  = Number(req.body.tc  || 0);

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required." });
    }

    const employees = await User.find({
      isActive: true,
      ...(employeeId ? { _id: employeeId } : { role: "employee" }),
    });
    if (!employees.length) {
      return res.status(404).json({ message: "No employees found for payroll generation." });
    }

    const generated = [];
    const skipped = [];

    for (const employee of employees) {
      const existingSalary = await Salary.findOne({ employeeId: employee._id, month, year });
      if (existingSalary?.status === "finalised" && !req.body.allowOverride) {
        skipped.push({
          employeeId: employee.employeeId,
          employeeName: employee.name,
          reason: "Payroll already finalised.",
        });
        continue;
      }

      const salary = await buildPayrollForEmployee({
        employee,
        month,
        year,
        generatedBy: req.user._id,
        otherDeductions: employeeId ? otherDeductions : 0,
        pf:  employeeId ? pf  : 0,
        pt:  employeeId ? pt  : 0,
        pfi: employeeId ? pfi : 0,
        tc:  employeeId ? tc  : 0,
      });
      generated.push(salary);
    }

    return res.json({
      message: `Payroll generated for ${generated.length} employee(s).`,
      generated,
      skipped,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function listPayroll(req, res) {
  try {
    const query = {};
    if (req.query.month) query.month = Number.parseInt(req.query.month, 10);
    if (req.query.year) query.year = Number.parseInt(req.query.year, 10);
    if (req.query.employeeId) query.employeeId = req.query.employeeId;
    if (req.query.status) query.status = req.query.status;

    const salaries = await Salary.find(query)
      .populate("employeeId", "employeeId name email department designation position salary doj")
      .populate("generatedBy", "employeeId name email")
      .sort({ year: -1, month: -1, createdAt: -1 });

    return res.json({ salaries });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function editPayroll(req, res) {
  try {
    const salary = await Salary.findById(req.params.id);
    if (!salary) {
      return res.status(404).json({ message: "Salary record not found." });
    }
    if (salary.status === "finalised" && !req.body.allowOverride) {
      return res.status(400).json({ message: "Finalised salary slips cannot be edited without HR override." });
    }

    [
      "grossSalary",
      "workingDays",
      "daysPresent",
      "daysAbsent",
      "lateMarks",
      "absentDeduction",
      "lateDeduction",
      "leaveDeduction",
      "otherDeductions",
      "pf",
      "pt",
      "pfi",
      "tc",
      "netPayable",
    ].forEach((field) => {
      if (req.body[field] !== undefined) salary[field] = Number(req.body[field]);
    });

    // Recalculate netPayable from all deductions if not explicitly overridden
    if (req.body.netPayable === undefined) {
      salary.netPayable = Math.max(
        0,
        Number(((salary.grossSalary || 0) -
          (salary.absentDeduction || 0) -
          (salary.lateDeduction || 0) -
          (salary.leaveDeduction || 0) -
          (salary.otherDeductions || 0) -
          (salary.pf || 0) -
          (salary.pt || 0) -
          (salary.pfi || 0) -
          (salary.tc || 0)).toFixed(2)),
      );
    }

    await salary.save();
    await salary.populate("employeeId", "employeeId name email department designation position salary doj");

    return res.json({ salary, message: "Salary record updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function finalisePayroll(req, res) {
  try {
    const salary = await Salary.findById(req.params.id);
    if (!salary) {
      return res.status(404).json({ message: "Salary record not found." });
    }

    salary.status = "finalised";
    await salary.save();

    const employee = await User.findById(salary.employeeId);
    if (employee) {
      employee.lateMarkCount = salary.carryForwardLateMarks;
      await employee.save();
    }

    await salary.populate("employeeId", "employeeId name email department designation position salary doj");

    return res.json({ salary, message: "Salary slip finalised successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function getMySalarySlip(req, res) {
  try {
    const month = Number.parseInt(req.params.month, 10);
    const year = Number.parseInt(req.params.year, 10);

    const query = { employeeId: req.user._id, month, year };

    // Employees can only view finalised slips (HR must publish before it's visible).
    // HR can view both draft and finalised records via the main /payroll route.
    if (req.user.role === "employee") {
      query.status = "finalised";
    }

    const salary = await Salary.findOne(query).populate(
      "employeeId",
      "employeeId name email department designation position salary doj",
    );

    if (!salary) {
      const notFoundMsg =
        req.user.role === "employee"
          ? "Salary slip not yet published for the selected month."
          : "Salary record not found for the selected month.";
      return res.status(404).json({ message: notFoundMsg });
    }

    return res.json({ salary });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

/**
 * GET /api/v1/payroll/attendance-check?month=3&year=2026
 * Returns a per-employee attendance summary for the selected month so HR can
 * verify data is ready before running payroll generation.
 */
async function attendanceCheck(req, res) {
  try {
    const month = Number.parseInt(req.query.month, 10);
    const year  = Number.parseInt(req.query.year,  10);

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required." });
    }

    const dateRange = {
      $gte: startOfMonth(year, month),
      $lte: endOfMonth(year, month),
    };

    const employees = await User.find({ isActive: true, role: "employee" })
      .select("_id employeeId name department designation")
      .lean();

    // Fetch all attendance records for the month in one query (faster than N queries)
    const allRecords = await Attendance.find({
      employeeId: { $in: employees.map((e) => e._id) },
      date: dateRange,
    })
      .select("employeeId status")
      .lean();

    const recordsByEmp = new Map();
    for (const rec of allRecords) {
      const key = String(rec.employeeId);
      if (!recordsByEmp.has(key)) recordsByEmp.set(key, []);
      recordsByEmp.get(key).push(rec.status);
    }

    const summary = employees.map((emp) => {
      const statuses = recordsByEmp.get(String(emp._id)) || [];
      const totalDays   = statuses.length;
      const presentDays = statuses.filter((s) => ["present", "late", "half-day"].includes(s)).length;
      const absentDays  = statuses.filter((s) => s === "absent").length;
      const lateDays    = statuses.filter((s) => s === "late").length;
      return {
        _id:        emp._id,
        employeeId: emp.employeeId,
        name:       emp.name,
        department: emp.department,
        designation: emp.designation,
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        hasData: totalDays > 0,
      };
    });

    const withData    = summary.filter((e) => e.hasData).length;
    const withoutData = summary.filter((e) => !e.hasData).length;

    return res.json({
      month,
      year,
      totalEmployees: employees.length,
      withData,
      withoutData,
      employees: summary,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

module.exports = {
  generatePayroll,
  listPayroll,
  editPayroll,
  finalisePayroll,
  getMySalarySlip,
  attendanceCheck,
};
