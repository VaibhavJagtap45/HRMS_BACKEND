// const User = require("../models/User");
// const { DEFAULT_LEAVE_BALANCE, DEFAULT_PASSWORD } = require("../utils/constants");

// function buildEmployeeSearchQuery(search) {
//   if (!search) {
//     return null;
//   }

//   return {
//     $or: [
//       { employeeId: { $regex: search, $options: "i" } },
//       { name: { $regex: search, $options: "i" } },
//       { email: { $regex: search, $options: "i" } },
//       { department: { $regex: search, $options: "i" } },
//       { designation: { $regex: search, $options: "i" } },
//       { position: { $regex: search, $options: "i" } },
//     ],
//   };
// }

// async function listEmployees(req, res) {
//   try {
//     const query = {};

//     if (req.user.role === "employee") {
//       query._id = req.user._id;
//     }

//     if (req.query.department) {
//       query.department = req.query.department;
//     }
//     if (req.query.role) {
//       query.role = req.query.role;
//     }
//     if (req.query.isActive !== undefined) {
//       query.isActive = req.query.isActive === "true";
//     }

//     const searchQuery = buildEmployeeSearchQuery(req.query.search);
//     if (searchQuery) {
//       Object.assign(query, searchQuery);
//     }

//     const page = Number.parseInt(req.query.page || "1", 10);
//     const limit = Number.parseInt(req.query.limit || "20", 10);
//     const skip = (page - 1) * limit;

//     const [employees, total] = await Promise.all([
//       User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
//       User.countDocuments(query),
//     ]);

//     return res.json({
//       employees,
//       pagination: {
//         page,
//         limit,
//         total,
//         pages: Math.ceil(total / limit) || 1,
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function getDepartments(req, res) {
//   try {
//     const departments = await User.distinct("department", {
//       department: { $ne: "" },
//       isActive: true,
//     });

//     return res.json({ departments });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function getStats(req, res) {
//   try {
//     const [totalEmployees, activeEmployees, departments] = await Promise.all([
//       User.countDocuments({ role: "employee" }),
//       User.countDocuments({ role: "employee", isActive: true }),
//       User.distinct("department", { department: { $ne: "" } }),
//     ]);

//     return res.json({
//       totalEmployees,
//       activeEmployees,
//       inactiveEmployees: totalEmployees - activeEmployees,
//       totalDepartments: departments.length,
//       departments,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function getEmployeeById(req, res) {
//   try {
//     if (req.user.role === "employee" && req.params.id !== req.user._id.toString()) {
//       return res.status(403).json({ message: "Not authorized to view this employee." });
//     }

//     const employee = await User.findById(req.params.id);
//     if (!employee) {
//       return res.status(404).json({ message: "Employee not found." });
//     }

//     return res.json({ employee });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function getOwnProfile(req, res) {
//   try {
//     const employee = await User.findById(req.user._id);
//     return res.json({ employee });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function updateOwnProfile(req, res) {
//   try {
//     const { phone, profilePic, avatar } = req.body;
//     const employee = await User.findById(req.user._id);

//     if (!employee) {
//       return res.status(404).json({ message: "Employee not found." });
//     }

//     if (phone !== undefined) {
//       employee.phone = phone.trim();
//     }
//     if (profilePic !== undefined) {
//       employee.profilePic = profilePic;
//       employee.avatar = profilePic;
//     }
//     if (avatar !== undefined) {
//       employee.avatar = avatar;
//       employee.profilePic = avatar;
//     }

//     await employee.save();
//     return res.json({ employee, message: "Profile updated successfully." });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function createEmployee(req, res) {
//   try {
//     const {
//       employeeId,
//       name,
//       email,
//       password,
//       role,
//       department,
//       designation,
//       position,
//       salary,
//       phone,
//       doj,
//       fingerprintId,
//       leaveBalance,
//       profilePic,
//       avatar,
//     } = req.body;

//     if (!name || !email) {
//       return res.status(400).json({ message: "Name and email are required." });
//     }

//     const existingUser = await User.findOne({
//       $or: [{ email: email.toLowerCase() }, ...(employeeId ? [{ employeeId: employeeId.toUpperCase() }] : [])],
//     });

//     if (existingUser) {
//       return res.status(400).json({ message: "Email or employee ID is already registered." });
//     }

//     if (fingerprintId !== undefined && fingerprintId !== null && fingerprintId !== "") {
//       const duplicateFingerprint = await User.findOne({ fingerprintId });
//       if (duplicateFingerprint) {
//         return res.status(400).json({
//           message: `Fingerprint ID ${fingerprintId} is already assigned to ${duplicateFingerprint.name}.`,
//         });
//       }
//     }

//     const employee = await User.create({
//       employeeId,
//       name,
//       email,
//       password: password || DEFAULT_PASSWORD,
//       role: role || "employee",
//       department: department || "",
//       designation: designation || position || "",
//       position: position || designation || "",
//       salary: Number(salary || 0),
//       phone: phone || "",
//       doj: doj || new Date(),
//       fingerprintId: fingerprintId === "" ? undefined : fingerprintId,
//       leaveBalance:
//         leaveBalance === undefined || leaveBalance === null || leaveBalance === ""
//           ? DEFAULT_LEAVE_BALANCE
//           : Number(leaveBalance),
//       profilePic: profilePic || avatar || "",
//       avatar: avatar || profilePic || "",
//       mustChangePassword: true,
//     });

//     return res.status(201).json({
//       employee,
//       message: "Employee created successfully.",
//     });
//   } catch (error) {
//     if (error.code === 11000) {
//       return res.status(400).json({ message: "Duplicate entry found for email, employee ID, or fingerprint ID." });
//     }
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function updateEmployee(req, res) {
//   try {
//     const employee = await User.findById(req.params.id).select("+password");
//     if (!employee) {
//       return res.status(404).json({ message: "Employee not found." });
//     }

//     const {
//       employeeId,
//       name,
//       email,
//       password,
//       role,
//       department,
//       designation,
//       position,
//       salary,
//       phone,
//       doj,
//       fingerprintId,
//       isActive,
//       leaveBalance,
//       profilePic,
//       avatar,
//     } = req.body;

//     if (email !== undefined && email !== employee.email) {
//       const duplicateEmail = await User.findOne({ email: email.toLowerCase(), _id: { $ne: employee._id } });
//       if (duplicateEmail) {
//         return res.status(400).json({ message: "Email is already registered." });
//       }
//       employee.email = email;
//     }

//     if (employeeId !== undefined && employeeId !== employee.employeeId) {
//       const duplicateEmployeeId = await User.findOne({
//         employeeId: employeeId.toUpperCase(),
//         _id: { $ne: employee._id },
//       });
//       if (duplicateEmployeeId) {
//         return res.status(400).json({ message: "Employee ID is already in use." });
//       }
//       employee.employeeId = employeeId;
//     }

//     if (fingerprintId !== undefined) {
//       const duplicateFingerprint = await User.findOne({
//         fingerprintId,
//         _id: { $ne: employee._id },
//       });
//       if (duplicateFingerprint) {
//         return res.status(400).json({ message: "Fingerprint ID is already assigned to another employee." });
//       }
//       employee.fingerprintId = fingerprintId === "" ? undefined : fingerprintId;
//     }

//     if (name !== undefined) employee.name = name;
//     if (role !== undefined) employee.role = role;
//     if (department !== undefined) employee.department = department;
//     if (designation !== undefined || position !== undefined) {
//       employee.designation = designation ?? position ?? employee.designation;
//       employee.position = position ?? designation ?? employee.position;
//     }
//     if (salary !== undefined) employee.salary = Number(salary || 0);
//     if (phone !== undefined) employee.phone = phone;
//     if (doj !== undefined) employee.doj = doj;
//     if (isActive !== undefined) employee.isActive = isActive;
//     if (leaveBalance !== undefined) employee.leaveBalance = Number(leaveBalance);
//     if (profilePic !== undefined) {
//       employee.profilePic = profilePic;
//       employee.avatar = profilePic;
//     }
//     if (avatar !== undefined) {
//       employee.avatar = avatar;
//       employee.profilePic = avatar;
//     }
//     if (password) {
//       employee.password = password;
//       employee.mustChangePassword = true;
//     }

//     await employee.save();

//     return res.json({
//       employee,
//       message: "Employee updated successfully.",
//     });
//   } catch (error) {
//     if (error.code === 11000) {
//       return res.status(400).json({ message: "Duplicate entry found for email, employee ID, or fingerprint ID." });
//     }
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function softDeleteEmployee(req, res) {
//   try {
//     if (req.params.id === req.user._id.toString()) {
//       return res.status(400).json({ message: "You cannot deactivate your own account." });
//     }

//     const employee = await User.findById(req.params.id);
//     if (!employee) {
//       return res.status(404).json({ message: "Employee not found." });
//     }

//     employee.isActive = false;
//     await employee.save();

//     return res.json({ message: "Employee deactivated successfully." });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// module.exports = {
//   listEmployees,
//   getDepartments,
//   getStats,
//   getEmployeeById,
//   getOwnProfile,
//   updateOwnProfile,
//   createEmployee,
//   updateEmployee,
//   softDeleteEmployee,
// };

const multer = require("multer");
const xlsx = require("xlsx");
const User = require("../models/User");
const {
  DEFAULT_LEAVE_BALANCE,
  DEFAULT_PASSWORD,
} = require("../utils/constants");

const employeeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = [".xls", ".xlsx", ".csv"];
    const ext = file.originalname
      .toLowerCase()
      .slice(file.originalname.lastIndexOf("."));
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error("Only .xls, .xlsx, or .csv files are allowed."));
  },
});

function normalizeImportHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Parse a date string in common formats: DD/MM/YYYY, YYYY-MM-DD, or Excel serial.
 */
function parseFlexDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return new Date(s);
  // Excel date serial
  const num = Number(s);
  if (!Number.isNaN(num) && num > 1000) {
    // xlsx epoch: Jan 1 1900 (with Lotus bug offset)
    return new Date(Math.round((num - 25569) * 86400 * 1000));
  }
  return null;
}

function generateEmailFromName(name, domain = "albos.com") {
  return (
    name
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z.]/g, "") +
    "@" +
    domain
  );
}

function parseEmployeeImportRows(buffer, originalname) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  // Locate the actual header row (contains "name" or "employee code")
  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < rawRows.length; i++) {
    const joined = rawRows[i].map((c) => normalizeImportHeader(c)).join("|");
    if (
      joined.includes("name") &&
      (joined.includes("employee code") ||
        joined.includes("card no") ||
        joined.includes("department"))
    ) {
      headerIdx = i;
      headers = rawRows[i].map((c) => normalizeImportHeader(c));
      break;
    }
  }
  if (headerIdx === -1)
    throw new Error(
      "Could not find header row. Expected columns: Employee Code, Name, Department, Designation, Joining Date.",
    );

  const col = (aliases) => {
    const idx = headers.findIndex((h) => aliases.includes(h));
    return idx >= 0 ? idx : null;
  };

  const colMap = {
    empCode: col(["employee code", "emp code", "empcode"]),
    cardNo: col(["card no", "card number", "cardno"]),
    name: col(["name", "emp name", "employee name"]),
    fatherName: col(["father's name", "fathers name", "father name"]),
    location: col(["branch/location", "location", "branch"]),
    department: col(["department", "dept"]),
    designation: col(["designation", "position"]),
    group: col(["group"]),
    dob: col(["birth date", "dob", "date of birth"]),
    doj: col(["joining date", "date of joining", "doj"]),
    gender: col(["gender", "sex"]),
    empType: col(["employment type", "emp type", "type"]),
    aadhar: col(["aadhar no", "aadhar"]),
    pan: col(["pan no", "pan"]),
    address: col(["address"]),
  };

  const get = (row, colIdx) =>
    colIdx !== null ? String(row[colIdx] || "").trim() : "";

  const dataRows = rawRows.slice(headerIdx + 1);
  return dataRows
    .map((row) => ({
      empCode: get(row, colMap.empCode),
      cardNo: get(row, colMap.cardNo),
      name: get(row, colMap.name),
      location: get(row, colMap.location),
      department: get(row, colMap.department),
      designation: get(row, colMap.designation),
      dob: get(row, colMap.dob),
      doj: get(row, colMap.doj),
      gender: get(row, colMap.gender),
      empType: get(row, colMap.empType),
      address: get(row, colMap.address),
    }))
    .filter((r) => r.name); // skip empty rows
}

function buildEmployeeSearchQuery(search) {
  if (!search) {
    return null;
  }

  return {
    $or: [
      { employeeId: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { department: { $regex: search, $options: "i" } },
      { designation: { $regex: search, $options: "i" } },
      { position: { $regex: search, $options: "i" } },
    ],
  };
}

async function listEmployees(req, res) {
  try {
    const query = {};

    if (req.user.role === "employee") {
      query._id = req.user._id;
    }

    if (req.query.department) {
      query.department = req.query.department;
    }
    if (req.query.role) {
      query.role = req.query.role;
    }
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const searchQuery = buildEmployeeSearchQuery(req.query.search);
    if (searchQuery) {
      Object.assign(query, searchQuery);
    }

    const page = Number.parseInt(req.query.page || "1", 10);
    const limit = Number.parseInt(req.query.limit || "20", 10);
    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);

    return res.json({
      employees,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function getDepartments(req, res) {
  try {
    const departments = await User.distinct("department", {
      department: { $ne: "" },
      isActive: true,
    });

    return res.json({ departments });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function getStats(req, res) {
  try {
    const [totalEmployees, activeEmployees, departments] = await Promise.all([
      User.countDocuments({ role: "employee" }),
      User.countDocuments({ role: "employee", isActive: true }),
      User.distinct("department", { department: { $ne: "" } }),
    ]);

    return res.json({
      totalEmployees,
      activeEmployees,
      inactiveEmployees: totalEmployees - activeEmployees,
      totalDepartments: departments.length,
      departments,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function getEmployeeById(req, res) {
  try {
    if (
      req.user.role === "employee" &&
      req.params.id !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this employee." });
    }

    const employee = await User.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    return res.json({ employee });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function getOwnProfile(req, res) {
  try {
    const employee = await User.findById(req.user._id);
    return res.json({ employee });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function updateOwnProfile(req, res) {
  try {
    const { phone, profilePic, avatar } = req.body;
    const employee = await User.findById(req.user._id);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    if (phone !== undefined) {
      employee.phone = phone.trim();
    }
    if (profilePic !== undefined) {
      employee.profilePic = profilePic;
      employee.avatar = profilePic;
    }
    if (avatar !== undefined) {
      employee.avatar = avatar;
      employee.profilePic = avatar;
    }

    await employee.save();
    return res.json({ employee, message: "Profile updated successfully." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function createEmployee(req, res) {
  try {
    const {
      employeeId,
      name,
      email,
      password,
      role,
      department,
      designation,
      position,
      salary,
      phone,
      doj,
      fingerprintId,
      leaveBalance,
      profilePic,
      avatar,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required." });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        ...(employeeId ? [{ employeeId: employeeId.toUpperCase() }] : []),
      ],
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Email or employee ID is already registered." });
    }

    if (
      fingerprintId !== undefined &&
      fingerprintId !== null &&
      fingerprintId !== ""
    ) {
      const duplicateFingerprint = await User.findOne({ fingerprintId });
      if (duplicateFingerprint) {
        return res.status(400).json({
          message: `Fingerprint ID ${fingerprintId} is already assigned to ${duplicateFingerprint.name}.`,
        });
      }
    }

    const employee = await User.create({
      employeeId,
      name,
      email,
      password: password || DEFAULT_PASSWORD,
      role: role || "employee",
      department: department || "",
      designation: designation || position || "",
      position: position || designation || "",
      salary: Number(salary || 0),
      phone: phone || "",
      doj: doj || new Date(),
      fingerprintId: fingerprintId === "" ? undefined : fingerprintId,
      leaveBalance:
        leaveBalance === undefined ||
        leaveBalance === null ||
        leaveBalance === ""
          ? DEFAULT_LEAVE_BALANCE
          : Number(leaveBalance),
      profilePic: profilePic || avatar || "",
      avatar: avatar || profilePic || "",
      mustChangePassword: true,
      tempPassword: password || DEFAULT_PASSWORD,
    });

    return res.status(201).json({
      employee,
      message: "Employee created successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
          message:
            "Duplicate entry found for email, employee ID, or fingerprint ID.",
        });
    }
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function updateEmployee(req, res) {
  try {
    const employee = await User.findById(req.params.id).select("+password");
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const {
      employeeId,
      name,
      email,
      password,
      role,
      department,
      designation,
      position,
      salary,
      phone,
      doj,
      fingerprintId,
      isActive,
      leaveBalance,
      profilePic,
      avatar,
    } = req.body;

    if (email !== undefined && email !== employee.email) {
      const duplicateEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: employee._id },
      });
      if (duplicateEmail) {
        return res
          .status(400)
          .json({ message: "Email is already registered." });
      }
      employee.email = email;
    }

    if (employeeId !== undefined && employeeId !== employee.employeeId) {
      const duplicateEmployeeId = await User.findOne({
        employeeId: employeeId.toUpperCase(),
        _id: { $ne: employee._id },
      });
      if (duplicateEmployeeId) {
        return res
          .status(400)
          .json({ message: "Employee ID is already in use." });
      }
      employee.employeeId = employeeId;
    }

    if (fingerprintId !== undefined) {
      const duplicateFingerprint = await User.findOne({
        fingerprintId,
        _id: { $ne: employee._id },
      });
      if (duplicateFingerprint) {
        return res
          .status(400)
          .json({
            message: "Fingerprint ID is already assigned to another employee.",
          });
      }
      employee.fingerprintId = fingerprintId === "" ? undefined : fingerprintId;
    }

    const { bankName, bankAccountNo, ifscCode, branchName } = req.body;
    if (bankName !== undefined) employee.bankName = bankName.trim();
    if (bankAccountNo !== undefined) employee.bankAccountNo = bankAccountNo.trim();
    if (ifscCode !== undefined) employee.ifscCode = ifscCode.trim().toUpperCase();
    if (branchName !== undefined) employee.branchName = branchName.trim();

    if (name !== undefined) employee.name = name;
    if (role !== undefined) employee.role = role;
    if (department !== undefined) employee.department = department;
    if (designation !== undefined || position !== undefined) {
      employee.designation = designation ?? position ?? employee.designation;
      employee.position = position ?? designation ?? employee.position;
    }
    if (salary !== undefined) employee.salary = Number(salary || 0);
    if (phone !== undefined) employee.phone = phone;
    if (doj !== undefined) employee.doj = doj;
    if (isActive !== undefined) employee.isActive = isActive;
    if (leaveBalance !== undefined)
      employee.leaveBalance = Number(leaveBalance);
    if (profilePic !== undefined) {
      employee.profilePic = profilePic;
      employee.avatar = profilePic;
    }
    if (avatar !== undefined) {
      employee.avatar = avatar;
      employee.profilePic = avatar;
    }
    if (password) {
      employee.password = password;
      employee.tempPassword = password;
      employee.mustChangePassword = true;
    }

    await employee.save();

    return res.json({
      employee,
      message: "Employee updated successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
          message:
            "Duplicate entry found for email, employee ID, or fingerprint ID.",
        });
    }
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function resetEmployeePassword(req, res) {
  try {
    const { password } = req.body;
    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    const employee = await User.findById(req.params.id).select("+password");
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    employee.password = String(password).trim();
    employee.tempPassword = String(password).trim();
    employee.mustChangePassword = true;
    await employee.save();

    return res.json({
      message: "Password reset successfully.",
      tempPassword: employee.tempPassword,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function softDeleteEmployee(req, res) {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot deactivate your own account." });
    }

    const employee = await User.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    employee.isActive = false;
    await employee.save();

    return res.json({ message: "Employee deactivated successfully." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function bulkCreateEmployees(req, res) {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "No file uploaded. Use form-data field 'file'." });
  }

  try {
    const rows = parseEmployeeImportRows(
      req.file.buffer,
      req.file.originalname,
    );
    if (!rows.length) {
      return res
        .status(400)
        .json({ message: "File is empty or has no data rows." });
    }

    // Build lookup maps for existing employees
    const existing = await User.find()
      .select("name email fingerprintId employeeId")
      .lean();
    const existingByName = new Map(
      existing.map((u) => [u.name.toLowerCase().trim(), u]),
    );
    const existingByFingerprint = new Map(
      existing
        .filter((u) => u.fingerprintId != null)
        .map((u) => [String(u.fingerprintId), u]),
    );
    const existingByEmpId = new Map(
      existing
        .filter((u) => u.employeeId)
        .map((u) => [String(u.employeeId).toUpperCase(), u]),
    );

    // Domain for auto-generated emails (can be made configurable)
    const emailDomain = process.env.EMAIL_DOMAIN || "albos.com";

    let created = 0;
    let skipped = 0;
    const errors = [];
    const createdEmployees = [];
    const skippedList = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row.name.trim();
      if (!name) continue;

      // Determine fingerprintId from Card No (preferred) or Emp Code
      const cardNoRaw = row.cardNo || row.empCode;
      const fingerprintNum = Number(cardNoRaw);
      const fingerprintId =
        !Number.isNaN(fingerprintNum) && fingerprintNum > 0
          ? fingerprintNum
          : undefined;

      // Skip if already exists by fingerprint or name
      const nameKey = name.toLowerCase();
      if (fingerprintId && existingByFingerprint.has(String(fingerprintId))) {
        skipped++;
        skippedList.push({
          name,
          reason: `Card No ${fingerprintId} already assigned`,
        });
        continue;
      }
      if (existingByName.has(nameKey)) {
        skipped++;
        skippedList.push({ name, reason: "Employee name already exists" });
        continue;
      }

      // Build email
      const baseEmail = generateEmailFromName(name, emailDomain);
      let email = baseEmail;
      // Ensure uniqueness by appending index if needed
      let suffix = 1;
      const allEmails = new Set(existing.map((u) => u.email.toLowerCase()));
      while (allEmails.has(email.toLowerCase())) {
        email = baseEmail.replace("@", `${suffix}@`);
        suffix++;
      }
      allEmails.add(email.toLowerCase()); // track within this batch

      const doj = parseFlexDate(row.doj) || new Date();
      const isActive =
        !row.empType || /permanent|active|regular/i.test(row.empType);

      try {
        const employee = await User.create({
          name,
          email,
          password: DEFAULT_PASSWORD,
          role: "employee",
          department: row.department || row.location || "",
          designation: row.designation || "",
          position: row.designation || "",
          doj,
          isActive,
          fingerprintId,
          leaveBalance: DEFAULT_LEAVE_BALANCE,
          mustChangePassword: true,
        });

        created++;
        createdEmployees.push({
          name,
          email,
          fingerprintId,
          department: employee.department,
        });
        // Update local tracking maps
        existingByName.set(nameKey, employee);
        if (fingerprintId)
          existingByFingerprint.set(String(fingerprintId), employee);
      } catch (err) {
        skipped++;
        errors.push(`Row ${i + 2} (${name}): ${err.message}`);
      }
    }

    return res.status(201).json({
      message: `Import complete: ${created} employees created, ${skipped} skipped.`,
      created,
      skipped,
      total: rows.length,
      employees: createdEmployees,
      skippedList,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return res
      .status(400)
      .json({ message: "Failed to parse file.", error: err.message });
  }
}

module.exports = {
  employeeUpload,
  listEmployees,
  getDepartments,
  getStats,
  getEmployeeById,
  getOwnProfile,
  updateOwnProfile,
  createEmployee,
  updateEmployee,
  resetEmployeePassword,
  softDeleteEmployee,
  bulkCreateEmployees,
};
