// const multer = require("multer");
// const xlsx = require("xlsx");
// const { parse } = require("csv-parse/sync");
// const Attendance = require("../models/Attendance");
// const Holiday = require("../models/Holiday");
// const SyncLog = require("../models/SyncLog");
// const User = require("../models/User");
// const {
//   buildLegacyLog,
//   DAILY_STATUSES,
//   LEGACY_EVENT_TYPES,
//   sortEvents,
//   syncAttendanceFromEvents,
//   upsertEvent,
// } = require("../utils/attendance");
// const {
//   combineDateAndTime,
//   endOfDay,
//   endOfMonth,
//   formatDateKey,
//   normalizeDate,
//   normalizeTime,
//   startOfDay,
//   startOfMonth,
// } = require("../utils/time");

// const attendanceUpload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 10 * 1024 * 1024 },
// });

// function normalizeHeader(header) {
//   return String(header || "")
//     .trim()
//     .toLowerCase()
//     .replace(/[_-]/g, " ")
//     .replace(/\s+/g, " ");
// }

// function pickColumn(headers, aliases) {
//   const match = headers
//     .map((header) => ({ original: header, normalized: normalizeHeader(header) }))
//     .find((header) => aliases.includes(header.normalized));
//   return match ? match.original : null;
// }

// function parseSpreadsheetRows(file) {
//   const fileName = String(file.originalname || "").toLowerCase();
//   if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
//     return parse(file.buffer.toString("utf8"), {
//       columns: true,
//       skip_empty_lines: true,
//       trim: true,
//       relax_column_count: true,
//     });
//   }
//   const workbook = xlsx.read(file.buffer, { type: "buffer", cellDates: false });
//   const sheet = workbook.Sheets[workbook.SheetNames[0]];
//   return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
// }

// function extractImportColumns(row) {
//   const headers = Object.keys(row || {});
//   return {
//     employeeId: pickColumn(headers, [
//       "employee id",
//       "employee code",
//       "emp code",
//       "empcode",
//       "employee code",
//       "employeeid",
//       "user id",
//       "user_id",
//       "userid",
//       "fingerprint id",
//       "fp id",
//       "fp_id",
//     ]),
//     employeeName: pickColumn(headers, ["employee name", "emp name", "name"]),
//     email: pickColumn(headers, ["email", "employee email"]),
//     date: pickColumn(headers, ["date", "attendance date", "punch date"]),
//     checkIn: pickColumn(headers, ["check in", "check-in", "in time", "intime", "checkin time"]),
//     checkOut: pickColumn(headers, ["check out", "check-out", "out time", "outtime", "checkout time"]),
//     timestamp: pickColumn(headers, ["timestamp", "datetime", "punch datetime", "date time"]),
//     direction: pickColumn(headers, ["direction", "punch direction", "status", "type", "mode", "in out", "in/out"]),
//     time: pickColumn(headers, ["time", "punch time"]),
//   };
// }

// function resolveDirectionToType(directionValue) {
//   const normalized = String(directionValue || "").trim().toLowerCase();
//   if (["out", "check-out", "checkout", "1", "o"].includes(normalized)) {
//     return "check-out";
//   }
//   return "check-in";
// }

// function getImportSource(fileName = "") {
//   return String(fileName).toLowerCase().endsWith(".csv") ? "csv-import" : "excel-upload";
// }

// function parseImportedDate(dateValue, timestampValue) {
//   const fromDate = normalizeDate(dateValue);
//   if (fromDate) {
//     return fromDate;
//   }
//   return normalizeDate(timestampValue);
// }

// async function getScopedEmployeeFilter(req, department) {
//   if (req.user.role === "employee") {
//     return { employeeId: req.user._id };
//   }
//   if (!department) {
//     return {};
//   }
//   const employees = await User.find({ department }).select("_id").lean();
//   return { employeeId: { $in: employees.map((employee) => employee._id) } };
// }

// function attachEmployeeAlias(records) {
//   return records.map((record) => {
//     const plainRecord = record.toObject ? record.toObject() : record;
//     plainRecord.employee = plainRecord.employeeId;
//     return plainRecord;
//   });
// }

// function buildDailyRecordResponse(record) {
//   const plainRecord = record.toObject ? record.toObject() : record;
//   plainRecord.employee = plainRecord.employeeId;
//   return plainRecord;
// }

// async function findEmployeeByAnyIdentifier(row, columns, employeeMap) {
//   const candidateValues = [
//     columns.employeeId ? row[columns.employeeId] : "",
//     columns.email ? row[columns.email] : "",
//     columns.employeeName ? row[columns.employeeName] : "",
//   ]
//     .filter(Boolean)
//     .map((value) => String(value).trim());

//   for (const candidate of candidateValues) {
//     const byEmployeeId = employeeMap.employeeId.get(candidate.toUpperCase());
//     if (byEmployeeId) return byEmployeeId;
//     const byFingerprint = employeeMap.fingerprint.get(candidate);
//     if (byFingerprint) return byFingerprint;
//     const byEmail = employeeMap.email.get(candidate.toLowerCase());
//     if (byEmail) return byEmail;
//     const byName = employeeMap.name.get(candidate.toLowerCase());
//     if (byName) return byName;
//   }

//   return null;
// }

// async function upsertDailyAttendance({
//   employeeId,
//   date,
//   checkIn,
//   checkOut,
//   status,
//   note,
//   source,
//   createdBy,
//   rawEmployeeCode,
// }) {
//   const normalizedDate = normalizeDate(date);
//   let attendance = await Attendance.findOne({ employeeId, date: normalizedDate });

//   if (!attendance) {
//     attendance = new Attendance({
//       employeeId,
//       date: normalizedDate,
//       source: source || "manual",
//       createdBy: createdBy || null,
//       note: note || "",
//       rawEmployeeCode: rawEmployeeCode || "",
//       events: [],
//     });
//   }

//   if (source) attendance.source = source;
//   if (createdBy !== undefined) attendance.createdBy = createdBy;
//   if (note !== undefined) attendance.note = note;
//   if (rawEmployeeCode !== undefined) attendance.rawEmployeeCode = rawEmployeeCode;
//   if (status && DAILY_STATUSES.includes(status)) attendance.status = status;

//   if (checkIn !== undefined) {
//     upsertEvent(attendance, "check-in", checkIn, {
//       source: source || attendance.source,
//       createdBy: createdBy || null,
//       note: note || "",
//       rawTimestamp: combineDateAndTime(normalizedDate, checkIn),
//     });
//   }
//   if (checkOut !== undefined) {
//     upsertEvent(attendance, "check-out", checkOut, {
//       source: source || attendance.source,
//       createdBy: createdBy || null,
//       note: note || "",
//       rawTimestamp: combineDateAndTime(normalizedDate, checkOut),
//     });
//   }

//   syncAttendanceFromEvents(attendance);
//   await attendance.save();
//   return attendance;
// }

// async function createManualAttendance(req, res) {
//   try {
//     const { employeeId, date, time, status, note } = req.body;
//     if (!employeeId || !date || !time || !status) {
//       return res.status(400).json({ message: "employeeId, date, time, and status are required." });
//     }
//     if (!LEGACY_EVENT_TYPES.includes(status)) {
//       return res.status(400).json({ message: "Invalid punch type provided." });
//     }

//     const employee = await User.findById(employeeId);
//     if (!employee) {
//       return res.status(404).json({ message: "Employee not found." });
//     }

//     const attendanceDate = normalizeDate(date);
//     let attendance = await Attendance.findOne({ employeeId, date: attendanceDate });

//     if (!attendance) {
//       attendance = new Attendance({
//         employeeId,
//         date: attendanceDate,
//         source: "manual",
//         createdBy: req.user._id,
//         note: note || "",
//         events: [],
//       });
//     }

//     attendance.source = "manual";
//     attendance.createdBy = req.user._id;
//     attendance.note = note || attendance.note;
//     attendance.events.push({
//       type: status,
//       time: normalizeTime(time),
//       note: note || "",
//       source: "manual",
//       createdBy: req.user._id,
//       rawTimestamp: combineDateAndTime(attendanceDate, time),
//     });

//     syncAttendanceFromEvents(attendance);
//     await attendance.save();
//     await attendance.populate("employeeId", "employeeId name email department designation position fingerprintId");

//     const latestEvent = sortEvents(attendance.events).find(
//       (event) => event.time === normalizeTime(time) && event.type === status,
//     ) || attendance.events[attendance.events.length - 1];

//     return res.status(201).json({
//       log: buildLegacyLog(attendance, latestEvent, attendance.employeeId),
//       message: "Attendance entry added successfully.",
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function listAttendance(req, res) {
//   try {
//     const { employeeId, month, year, status, department } = req.query;
//     const page = Number.parseInt(req.query.page || "1", 10);
//     const limit = Number.parseInt(req.query.limit || "20", 10);
//     const skip = (page - 1) * limit;
//     const query = { ...(await getScopedEmployeeFilter(req, department)) };

//     if (req.user.role === "hr" && employeeId) query.employeeId = employeeId;
//     if (status) query.status = status;
//     if (month && year) {
//       query.date = {
//         $gte: startOfMonth(Number(year), Number(month)),
//         $lte: endOfMonth(Number(year), Number(month)),
//       };
//     }

//     const [records, total] = await Promise.all([
//       Attendance.find(query)
//         .populate("employeeId", "employeeId name email department designation position fingerprintId")
//         .sort({ date: -1 })
//         .skip(skip)
//         .limit(limit),
//       Attendance.countDocuments(query),
//     ]);

//     return res.json({
//       records: attachEmployeeAlias(records),
//       pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function createAttendanceRecord(req, res) {
//   try {
//     const { employeeId, date, checkIn, checkOut, status, note } = req.body;
//     if (!employeeId || !date) {
//       return res.status(400).json({ message: "employeeId and date are required." });
//     }

//     const employee = await User.findById(employeeId);
//     if (!employee) {
//       return res.status(404).json({ message: "Employee not found." });
//     }

//     const attendance = await upsertDailyAttendance({
//       employeeId,
//       date,
//       checkIn,
//       checkOut,
//       status,
//       note,
//       source: "manual",
//       createdBy: req.user._id,
//     });

//     await attendance.populate("employeeId", "employeeId name email department designation position fingerprintId");

//     return res.status(201).json({
//       attendance: buildDailyRecordResponse(attendance),
//       message: "Attendance record saved successfully.",
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function updateAttendanceRecord(req, res) {
//   try {
//     const directRecord = await Attendance.findById(req.params.id);

//     if (directRecord) {
//       const { employeeId, date, checkIn, checkOut, status, note } = req.body;
//       if (employeeId) {
//         const employee = await User.findById(employeeId);
//         if (!employee) return res.status(404).json({ message: "Employee not found." });
//         directRecord.employeeId = employeeId;
//       }
//       if (date) directRecord.date = normalizeDate(date);
//       if (note !== undefined) directRecord.note = note;
//       if (status && DAILY_STATUSES.includes(status)) directRecord.status = status;
//       if (checkIn !== undefined) directRecord.checkIn = normalizeTime(checkIn);
//       if (checkOut !== undefined) directRecord.checkOut = normalizeTime(checkOut);

//       if (checkIn !== undefined) {
//         upsertEvent(directRecord, "check-in", checkIn, {
//           source: directRecord.source,
//           createdBy: directRecord.createdBy,
//           note: directRecord.note,
//           rawTimestamp: combineDateAndTime(directRecord.date, checkIn),
//         });
//       }
//       if (checkOut !== undefined) {
//         upsertEvent(directRecord, "check-out", checkOut, {
//           source: directRecord.source,
//           createdBy: directRecord.createdBy,
//           note: directRecord.note,
//           rawTimestamp: combineDateAndTime(directRecord.date, checkOut),
//         });
//       }

//       syncAttendanceFromEvents(directRecord);
//       await directRecord.save();
//       await directRecord.populate("employeeId", "employeeId name email department designation position fingerprintId");

//       return res.json({
//         attendance: buildDailyRecordResponse(directRecord),
//         message: "Attendance record updated successfully.",
//       });
//     }

//     const parentRecord = await Attendance.findOne({ "events._id": req.params.id });
//     if (!parentRecord) {
//       return res.status(404).json({ message: "Attendance record not found." });
//     }

//     const event = parentRecord.events.id(req.params.id);
//     if (!event) {
//       return res.status(404).json({ message: "Attendance event not found." });
//     }

//     const targetDate = normalizeDate(req.body.date || parentRecord.date);
//     const targetTime = normalizeTime(req.body.time || event.time);
//     const targetStatus = req.body.status || event.type;
//     if (!LEGACY_EVENT_TYPES.includes(targetStatus)) {
//       return res.status(400).json({ message: "Invalid punch type provided." });
//     }

//     const eventData = {
//       type: targetStatus,
//       time: targetTime,
//       note: req.body.note !== undefined ? req.body.note : event.note,
//       source: event.source,
//       createdBy: event.createdBy,
//       rawTimestamp: combineDateAndTime(targetDate, targetTime),
//     };

//     parentRecord.events = parentRecord.events.filter((entry) => entry._id.toString() !== req.params.id);
//     syncAttendanceFromEvents(parentRecord);

//     if (!parentRecord.events.length && ["present", "late", "absent"].includes(parentRecord.status)) {
//       await Attendance.deleteOne({ _id: parentRecord._id });
//     } else {
//       await parentRecord.save();
//     }

//     let targetRecord = await Attendance.findOne({ employeeId: parentRecord.employeeId, date: targetDate });
//     if (!targetRecord) {
//       targetRecord = new Attendance({
//         employeeId: parentRecord.employeeId,
//         date: targetDate,
//         source: "manual",
//         createdBy: req.user._id,
//         note: eventData.note || "",
//         events: [],
//       });
//     }

//     targetRecord.events.push(eventData);
//     targetRecord.note = eventData.note || targetRecord.note;
//     targetRecord.source = "manual";
//     targetRecord.createdBy = req.user._id;
//     syncAttendanceFromEvents(targetRecord);
//     await targetRecord.save();
//     await targetRecord.populate("employeeId", "employeeId name email department designation position fingerprintId");

//     const savedEvent = sortEvents(targetRecord.events).find(
//       (entry) => entry.time === targetTime && entry.type === targetStatus,
//     ) || targetRecord.events[targetRecord.events.length - 1];

//     return res.json({
//       log: buildLegacyLog(targetRecord, savedEvent, targetRecord.employeeId),
//       message: "Attendance updated successfully.",
//     });
//   } catch (error) {
//     if (error.code === 11000) {
//       return res.status(409).json({ message: "Attendance already exists for this employee and date." });
//     }
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function deleteAttendanceRecord(req, res) {
//   try {
//     const directRecord = await Attendance.findById(req.params.id);
//     if (directRecord) {
//       await Attendance.deleteOne({ _id: directRecord._id });
//       return res.json({ message: "Attendance record deleted successfully." });
//     }

//     const parentRecord = await Attendance.findOne({ "events._id": req.params.id });
//     if (!parentRecord) {
//       return res.status(404).json({ message: "Attendance record not found." });
//     }

//     parentRecord.events = parentRecord.events.filter((event) => event._id.toString() !== req.params.id);
//     syncAttendanceFromEvents(parentRecord);

//     if (!parentRecord.events.length && ["present", "late", "absent"].includes(parentRecord.status)) {
//       await Attendance.deleteOne({ _id: parentRecord._id });
//     } else {
//       await parentRecord.save();
//     }

//     return res.json({ message: "Attendance entry deleted successfully." });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function bulkUploadAttendance(req, res) {
//   if (!req.file) {
//     return res.status(400).json({ message: "No file uploaded. Use form-data field 'file'." });
//   }

//   try {
//     const rows = parseSpreadsheetRows(req.file);
//     if (!rows.length) {
//       return res.status(400).json({ message: "Uploaded file is empty." });
//     }

//     const columns = extractImportColumns(rows[0]);
//     const employees = await User.find({ isActive: true }).select("_id employeeId name email fingerprintId");
//     const employeeMap = {
//       employeeId: new Map(),
//       fingerprint: new Map(),
//       email: new Map(),
//       name: new Map(),
//     };

//     employees.forEach((employee) => {
//       employeeMap.employeeId.set(String(employee.employeeId || "").toUpperCase(), employee);
//       if (employee.fingerprintId !== undefined && employee.fingerprintId !== null) {
//         employeeMap.fingerprint.set(String(employee.fingerprintId), employee);
//       }
//       employeeMap.email.set(String(employee.email || "").toLowerCase(), employee);
//       employeeMap.name.set(String(employee.name || "").toLowerCase(), employee);
//     });

//     let inserted = 0;
//     let skipped = 0;
//     let unmapped = 0;
//     const unmappedIds = new Set();
//     const errors = [];
//     const importSource = getImportSource(req.file.originalname);

//     for (let index = 0; index < rows.length; index += 1) {
//       const row = rows[index];
//       const employee = await findEmployeeByAnyIdentifier(row, columns, employeeMap);
//       if (!employee) {
//         unmapped += 1;
//         unmappedIds.add(String((columns.employeeId && row[columns.employeeId]) || `row-${index + 2}`));
//         continue;
//       }

//       const date = parseImportedDate(columns.date ? row[columns.date] : "", columns.timestamp ? row[columns.timestamp] : "");
//       if (!date) {
//         skipped += 1;
//         errors.push(`Row ${index + 2}: unable to parse the attendance date.`);
//         continue;
//       }

//       try {
//         const checkIn = columns.checkIn ? row[columns.checkIn] : "";
//         const checkOut = columns.checkOut ? row[columns.checkOut] : "";

//         if (checkIn || checkOut) {
//           await upsertDailyAttendance({
//             employeeId: employee._id,
//             date,
//             checkIn,
//             checkOut,
//             source: "excel",
//             createdBy: req.user._id,
//             rawEmployeeCode: columns.employeeId ? String(row[columns.employeeId] || "") : "",
//             note: `Imported from ${req.file.originalname}`,
//           });
//         } else {
//           const eventType = resolveDirectionToType(columns.direction ? row[columns.direction] : "");
//           const eventTime = columns.time ? row[columns.time] : columns.timestamp ? row[columns.timestamp] : "";
//           if (!normalizeTime(eventTime)) {
//             skipped += 1;
//             errors.push(`Row ${index + 2}: unable to parse time.`);
//             continue;
//           }

//           let attendance = await Attendance.findOne({ employeeId: employee._id, date });
//           if (!attendance) {
//             attendance = new Attendance({
//               employeeId: employee._id,
//               date,
//               source: "excel",
//               createdBy: req.user._id,
//               note: `Imported from ${req.file.originalname}`,
//               rawEmployeeCode: columns.employeeId ? String(row[columns.employeeId] || "") : "",
//               events: [],
//             });
//           }

//           const normalizedEventTime = normalizeTime(eventTime);
//           const duplicateEvent = attendance.events.find(
//             (event) => event.type === eventType && event.time === normalizedEventTime,
//           );
//           if (duplicateEvent) {
//             skipped += 1;
//             continue;
//           }

//           attendance.events.push({
//             type: eventType,
//             time: normalizedEventTime,
//             note: "",
//             source: "excel",
//             createdBy: req.user._id,
//             rawTimestamp: combineDateAndTime(date, normalizedEventTime),
//           });
//           attendance.source = "excel";
//           attendance.createdBy = req.user._id;
//           syncAttendanceFromEvents(attendance);
//           await attendance.save();
//         }

//         inserted += 1;
//       } catch (error) {
//         skipped += 1;
//         errors.push(`Row ${index + 2}: ${error.message}`);
//       }
//     }

//     await SyncLog.create({
//       source: importSource,
//       fileName: req.file.originalname,
//       recordsFetched: rows.length,
//       recordsInserted: inserted,
//       recordsSkipped: skipped,
//       recordsUnmapped: unmapped,
//       status: inserted > 0 ? (skipped > 0 || unmapped > 0 ? "partial" : "success") : "failed",
//       errorMessage: errors.slice(0, 5).join(" | "),
//       unmappedIds: [...unmappedIds],
//       importedBy: req.user._id,
//     });

//     return res.json({
//       message: `Import complete: ${inserted} records processed, ${skipped} skipped, ${unmapped} unmapped.`,
//       inserted,
//       skipped,
//       unmapped,
//       unmappedIds: [...unmappedIds],
//       errors: errors.slice(0, 20),
//       totalRows: rows.length,
//     });
//   } catch (error) {
//     return res.status(400).json({ message: "Failed to parse the uploaded file.", error: error.message });
//   }
// }

// async function legacyImportCsv(req, res) {
//   return bulkUploadAttendance(req, res);
// }

// async function legacyDailyReport(req, res) {
//   try {
//     const date = req.query.date ? normalizeDate(req.query.date) : normalizeDate(new Date());
//     const page = Number.parseInt(req.query.page || "1", 10);
//     const limit = Number.parseInt(req.query.limit || "50", 10);
//     const query = {
//       ...(await getScopedEmployeeFilter(req, req.query.department)),
//       date: { $gte: startOfDay(date), $lte: endOfDay(date) },
//     };

//     const records = await Attendance.find(query)
//       .populate("employeeId", "employeeId name email department designation position fingerprintId")
//       .sort({ date: 1 });

//     const logs = records.flatMap((record) => {
//       const events = sortEvents(record.events || []);
//       if (!events.length) {
//         return [buildLegacyLog(record, null, record.employeeId)];
//       }
//       return events.map((event) => buildLegacyLog(record, event, record.employeeId));
//     });

//     const skip = (page - 1) * limit;
//     return res.json({
//       logs: logs.slice(skip, skip + limit),
//       pagination: {
//         page,
//         limit,
//         total: logs.length,
//         pages: Math.ceil(logs.length / limit) || 1,
//       },
//       date: formatDateKey(date),
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function legacyHistory(req, res) {
//   try {
//     if (req.user.role === "employee" && req.params.employeeId !== req.user._id.toString()) {
//       return res.status(403).json({ message: "Not authorized." });
//     }

//     const query = { employeeId: req.params.employeeId };
//     if (req.query.startDate || req.query.endDate) {
//       query.date = {};
//       if (req.query.startDate) query.date.$gte = startOfDay(req.query.startDate);
//       if (req.query.endDate) query.date.$lte = endOfDay(req.query.endDate);
//     }

//     const page = Number.parseInt(req.query.page || "1", 10);
//     const limit = Number.parseInt(req.query.limit || "50", 10);

//     const [records, employee] = await Promise.all([
//       Attendance.find(query)
//         .populate("employeeId", "employeeId name email department designation position fingerprintId")
//         .sort({ date: -1 }),
//       User.findById(req.params.employeeId).select(
//         "employeeId name email department designation position fingerprintId phone salary doj",
//       ),
//     ]);

//     const logs = records.flatMap((record) => {
//       const events = sortEvents(record.events || []).reverse();
//       if (!events.length) {
//         return [buildLegacyLog(record, null, record.employeeId)];
//       }
//       return events.map((event) => buildLegacyLog(record, event, record.employeeId));
//     });

//     const skip = (page - 1) * limit;
//     return res.json({
//       employee,
//       logs: logs.slice(skip, skip + limit),
//       pagination: {
//         page,
//         limit,
//         total: logs.length,
//         pages: Math.ceil(logs.length / limit) || 1,
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// // ── Monthly pivot-table upload ────────────────────────────────────────────────
// // Format: header row = "Emp Code | Emp Name | 1 | 2 | … | 31"
// //         Each employee occupies 2 consecutive rows:
// //           Row 1 – check-in times (or NA / WO-I / A)
// //           Row 2 – check-out times (or empty)
// // Body params required: month (1-12), year (YYYY)
// async function monthlyUploadAttendance(req, res) {
//   if (!req.file) {
//     return res.status(400).json({ message: "No file uploaded. Use form-data field 'file'." });
//   }

//   const month = Number.parseInt(req.body.month, 10);
//   const year = Number.parseInt(req.body.year, 10);
//   if (!month || !year || month < 1 || month > 12) {
//     return res.status(400).json({ message: "Valid month (1-12) and year are required in the request body." });
//   }

//   try {
//     // Read as raw 2-D array so we can process 2-row-per-employee groups
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer", cellDates: false });
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

//     // ── Locate header row ──────────────────────────────────────────────────────
//     let headerRowIndex = -1;
//     let headerRow = [];
//     for (let i = 0; i < rawRows.length; i += 1) {
//       const joined = rawRows[i].map((cell) => String(cell || "").toLowerCase().trim()).join("|");
//       if (joined.includes("emp code") || joined.includes("emp name") || joined.includes("employee code")) {
//         headerRowIndex = i;
//         headerRow = rawRows[i];
//         break;
//       }
//     }
//     if (headerRowIndex === -1) {
//       return res.status(400).json({
//         message: "Header row with 'Emp Code' / 'Emp Name' not found. Make sure the file matches the monthly attendance report format.",
//       });
//     }

//     // ── Resolve column positions ───────────────────────────────────────────────
//     const empCodeCol = headerRow.findIndex((h) =>
//       ["emp code", "employee code", "empcode", "emp_code", "card no", "cardno"].includes(
//         String(h || "").toLowerCase().trim(),
//       ),
//     );
//     const empNameCol = headerRow.findIndex((h) =>
//       ["emp name", "employee name", "name"].includes(String(h || "").toLowerCase().trim()),
//     );

//     // Day columns: cells whose value is a pure integer 1-31
//     const dayColumns = {};
//     headerRow.forEach((cell, idx) => {
//       const val = String(cell || "").trim();
//       const n = Number(val);
//       if (Number.isInteger(n) && n >= 1 && n <= 31 && String(n) === val) {
//         dayColumns[n] = idx;
//       }
//     });

//     if (Object.keys(dayColumns).length === 0) {
//       return res.status(400).json({ message: "No day columns (1-31) found in the header row." });
//     }

//     // ── Build employee lookup maps ─────────────────────────────────────────────
//     const employees = await User.find({ isActive: true })
//       .select("_id employeeId name email fingerprintId")
//       .lean();

//     const byFingerprint = new Map();
//     const byName = new Map();
//     const byEmpId = new Map();
//     employees.forEach((emp) => {
//       if (emp.fingerprintId != null) byFingerprint.set(String(emp.fingerprintId), emp);
//       byName.set(String(emp.name || "").toLowerCase().trim(), emp);
//       if (emp.employeeId) byEmpId.set(String(emp.employeeId).toUpperCase(), emp);
//     });

//     // ── Process data rows in pairs ─────────────────────────────────────────────
//     const dataRows = rawRows.slice(headerRowIndex + 1);
//     let inserted = 0;
//     let skipped = 0;
//     let unmapped = 0;
//     const unmappedIds = new Set();
//     const errors = [];
//     const SKIP_VALUES = new Set(["na", "a", "wo-i", "wo", "-", "off", ""]);

//     let rowIdx = 0;
//     while (rowIdx < dataRows.length) {
//       const checkInRow = dataRows[rowIdx];
//       const empCodeRaw = empCodeCol >= 0 ? String(checkInRow[empCodeCol] || "").trim() : "";
//       const empNameRaw = empNameCol >= 0 ? String(checkInRow[empNameCol] || "").trim() : "";

//       // Skip completely empty rows
//       if (!empCodeRaw && !empNameRaw) {
//         rowIdx += 1;
//         continue;
//       }

//       // Decide whether the next row is the paired check-out row
//       const nextRow = dataRows[rowIdx + 1] || [];
//       const nextCode = empCodeCol >= 0 ? String(nextRow[empCodeCol] || "").trim() : "";
//       const nextName = empNameCol >= 0 ? String(nextRow[empNameCol] || "").trim() : "";
//       const hasPairedRow = !nextCode && !nextName;
//       const checkOutRow = hasPairedRow ? nextRow : [];
//       const advance = hasPairedRow ? 2 : 1;

//       // Match employee
//       let employee = null;
//       const fpNum = Number(empCodeRaw);
//       if (Number.isInteger(fpNum) && fpNum > 0) employee = byFingerprint.get(String(fpNum));
//       if (!employee && empNameRaw) employee = byName.get(empNameRaw.toLowerCase());
//       if (!employee && empCodeRaw) employee = byEmpId.get(empCodeRaw.toUpperCase());

//       if (!employee) {
//         unmapped += 1;
//         unmappedIds.add(empCodeRaw || empNameRaw);
//         rowIdx += advance;
//         continue;
//       }

//       // Process each day column
//       for (const [dayStr, colIdx] of Object.entries(dayColumns)) {
//         const dayNum = Number(dayStr);
//         const checkInRaw = String(checkInRow[colIdx] || "").trim();
//         const checkOutRaw = String(checkOutRow[colIdx] || "").trim();

//         if (SKIP_VALUES.has(checkInRaw.toLowerCase())) continue;

//         const checkIn = normalizeTime(checkInRaw);
//         if (!checkIn) {
//           skipped += 1;
//           continue;
//         }
//         const checkOut = normalizeTime(checkOutRaw) || undefined;

//         // Validate calendar date (guards against day 31 in Feb etc.)
//         const dateObj = new Date(year, month - 1, dayNum);
//         if (dateObj.getMonth() !== month - 1) continue;

//         try {
//           await upsertDailyAttendance({
//             employeeId: employee._id,
//             date: dateObj,
//             checkIn,
//             checkOut,
//             source: "excel",
//             createdBy: req.user._id,
//             rawEmployeeCode: empCodeRaw,
//             note: `Monthly import – ${req.file.originalname}`,
//           });
//           inserted += 1;
//         } catch (err) {
//           skipped += 1;
//           errors.push(`${empNameRaw || empCodeRaw} Day ${dayNum}: ${err.message}`);
//         }
//       }

//       rowIdx += advance;
//     }

//     await SyncLog.create({
//       source: "excel-upload",
//       fileName: req.file.originalname,
//       recordsFetched: dataRows.length,
//       recordsInserted: inserted,
//       recordsSkipped: skipped,
//       recordsUnmapped: unmapped,
//       status: inserted > 0 ? (skipped > 0 || unmapped > 0 ? "partial" : "success") : "failed",
//       errorMessage: errors.slice(0, 5).join(" | "),
//       unmappedIds: [...unmappedIds],
//       importedBy: req.user._id,
//     });

//     return res.json({
//       message: `Monthly import complete: ${inserted} day records inserted, ${skipped} skipped, ${unmapped} employee(s) unmapped.`,
//       inserted,
//       skipped,
//       unmapped,
//       unmappedIds: [...unmappedIds],
//       errors: errors.slice(0, 20),
//     });
//   } catch (error) {
//     return res.status(400).json({ message: "Failed to parse the monthly attendance file.", error: error.message });
//   }
// }

// async function getImportLogs(req, res) {
//   try {
//     const logs = await SyncLog.find()
//       .populate("importedBy", "employeeId name email")
//       .sort({ createdAt: -1 })
//       .limit(50);
//     return res.json({ logs });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function getAttendanceStats(req, res) {
//   try {
//     const today = normalizeDate(new Date());
//     const query = req.user.role === "employee" ? { employeeId: req.user._id } : {};
//     const [recordsToday, totalRecords, lastImport] = await Promise.all([
//       Attendance.find({
//         ...query,
//         date: { $gte: startOfDay(today), $lte: endOfDay(today) },
//       }).lean(),
//       Attendance.countDocuments(query),
//       SyncLog.findOne().sort({ createdAt: -1 }),
//     ]);

//     return res.json({
//       todayPresent: recordsToday.filter((record) => ["present", "late", "half-day"].includes(record.status)).length,
//       todayPunches: recordsToday.reduce((count, record) => count + (record.events?.length || 0), 0),
//       totalRecords,
//       lastImport: lastImport ? lastImport.createdAt : null,
//       lastImportStatus: lastImport ? lastImport.status : null,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// async function getMyMonthlyAttendance(req, res) {
//   try {
//     const month = Number.parseInt(req.params.month, 10);
//     const year = Number.parseInt(req.params.year, 10);
//     const range = {
//       $gte: startOfMonth(year, month),
//       $lte: endOfMonth(year, month),
//     };

//     const [records, holidays] = await Promise.all([
//       Attendance.find({ employeeId: req.user._id, date: range }).sort({ date: 1 }),
//       Holiday.find({ date: range }).sort({ date: 1 }),
//     ]);

//     return res.json({
//       month,
//       year,
//       records: records.map(buildDailyRecordResponse),
//       holidays,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error.", error: error.message });
//   }
// }

// module.exports = {
//   attendanceUpload,
//   listAttendance,
//   createAttendanceRecord,
//   updateAttendanceRecord,
//   deleteAttendanceRecord,
//   createManualAttendance,
//   bulkUploadAttendance,
//   monthlyUploadAttendance,
//   legacyImportCsv,
//   legacyDailyReport,
//   legacyHistory,
//   getImportLogs,
//   getAttendanceStats,
//   getMyMonthlyAttendance,
// };

const multer = require("multer");
const xlsx = require("xlsx");
const { parse } = require("csv-parse/sync");
const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");
const SyncLog = require("../models/SyncLog");
const User = require("../models/User");
const {
  buildLegacyLog,
  DAILY_STATUSES,
  LEGACY_EVENT_TYPES,
  sortEvents,
  syncAttendanceFromEvents,
  upsertEvent,
} = require("../utils/attendance");
const {
  combineDateAndTime,
  endOfDay,
  endOfMonth,
  formatDateKey,
  normalizeDate,
  normalizeTime,
  startOfDay,
  startOfMonth,
} = require("../utils/time");

const attendanceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ");
}

function pickColumn(headers, aliases) {
  const match = headers
    .map((header) => ({
      original: header,
      normalized: normalizeHeader(header),
    }))
    .find((header) => aliases.includes(header.normalized));
  return match ? match.original : null;
}

function parseSpreadsheetRows(file) {
  const fileName = String(file.originalname || "").toLowerCase();
  if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
    return parse(file.buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  }
  const workbook = xlsx.read(file.buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function extractImportColumns(row) {
  const headers = Object.keys(row || {});
  return {
    employeeId: pickColumn(headers, [
      "employee id",
      "employee code",
      "emp code",
      "empcode",
      "employee code",
      "employeeid",
      "user id",
      "user_id",
      "userid",
      "fingerprint id",
      "fp id",
      "fp_id",
    ]),
    employeeName: pickColumn(headers, ["employee name", "emp name", "name"]),
    email: pickColumn(headers, ["email", "employee email"]),
    date: pickColumn(headers, ["date", "attendance date", "punch date"]),
    checkIn: pickColumn(headers, [
      "check in",
      "check-in",
      "in time",
      "intime",
      "checkin time",
    ]),
    checkOut: pickColumn(headers, [
      "check out",
      "check-out",
      "out time",
      "outtime",
      "checkout time",
    ]),
    timestamp: pickColumn(headers, [
      "timestamp",
      "datetime",
      "punch datetime",
      "date time",
    ]),
    direction: pickColumn(headers, [
      "direction",
      "punch direction",
      "status",
      "type",
      "mode",
      "in out",
      "in/out",
    ]),
    time: pickColumn(headers, ["time", "punch time"]),
  };
}

function resolveDirectionToType(directionValue) {
  const normalized = String(directionValue || "")
    .trim()
    .toLowerCase();
  if (["out", "check-out", "checkout", "1", "o"].includes(normalized)) {
    return "check-out";
  }
  return "check-in";
}

function getImportSource(fileName = "") {
  return String(fileName).toLowerCase().endsWith(".csv")
    ? "csv-import"
    : "excel-upload";
}

function parseImportedDate(dateValue, timestampValue) {
  const fromDate = normalizeDate(dateValue);
  if (fromDate) {
    return fromDate;
  }
  return normalizeDate(timestampValue);
}

async function getScopedEmployeeFilter(req, department) {
  if (req.user.role === "employee") {
    return { employeeId: req.user._id };
  }
  if (!department) {
    return {};
  }
  const employees = await User.find({ department }).select("_id").lean();
  return { employeeId: { $in: employees.map((employee) => employee._id) } };
}

function attachEmployeeAlias(records) {
  return records.map((record) => {
    const plainRecord = record.toObject ? record.toObject() : record;
    plainRecord.employee = plainRecord.employeeId;
    return plainRecord;
  });
}

function buildDailyRecordResponse(record) {
  const plainRecord = record.toObject ? record.toObject() : record;
  plainRecord.employee = plainRecord.employeeId;
  return plainRecord;
}

async function findEmployeeByAnyIdentifier(row, columns, employeeMap) {
  const candidateValues = [
    columns.employeeId ? row[columns.employeeId] : "",
    columns.email ? row[columns.email] : "",
    columns.employeeName ? row[columns.employeeName] : "",
  ]
    .filter(Boolean)
    .map((value) => String(value).trim());

  for (const candidate of candidateValues) {
    const byEmployeeId = employeeMap.employeeId.get(candidate.toUpperCase());
    if (byEmployeeId) return byEmployeeId;
    const byFingerprint = employeeMap.fingerprint.get(candidate);
    if (byFingerprint) return byFingerprint;
    const byEmail = employeeMap.email.get(candidate.toLowerCase());
    if (byEmail) return byEmail;
    const byName = employeeMap.name.get(candidate.toLowerCase());
    if (byName) return byName;
  }

  return null;
}

async function upsertDailyAttendance({
  employeeId,
  date,
  checkIn,
  checkOut,
  status,
  note,
  source,
  createdBy,
  rawEmployeeCode,
}) {
  const normalizedDate = normalizeDate(date);
  let attendance = await Attendance.findOne({
    employeeId,
    date: normalizedDate,
  });

  if (!attendance) {
    attendance = new Attendance({
      employeeId,
      date: normalizedDate,
      source: source || "manual",
      createdBy: createdBy || null,
      note: note || "",
      rawEmployeeCode: rawEmployeeCode || "",
      events: [],
    });
  }

  if (source) attendance.source = source;
  if (createdBy !== undefined) attendance.createdBy = createdBy;
  if (note !== undefined) attendance.note = note;
  if (rawEmployeeCode !== undefined)
    attendance.rawEmployeeCode = rawEmployeeCode;
  if (status && DAILY_STATUSES.includes(status)) attendance.status = status;

  if (checkIn !== undefined) {
    upsertEvent(attendance, "check-in", checkIn, {
      source: source || attendance.source,
      createdBy: createdBy || null,
      note: note || "",
      rawTimestamp: combineDateAndTime(normalizedDate, checkIn),
    });
  }
  if (checkOut !== undefined) {
    upsertEvent(attendance, "check-out", checkOut, {
      source: source || attendance.source,
      createdBy: createdBy || null,
      note: note || "",
      rawTimestamp: combineDateAndTime(normalizedDate, checkOut),
    });
  }

  syncAttendanceFromEvents(attendance);
  await attendance.save();
  return attendance;
}

async function createManualAttendance(req, res) {
  try {
    const { employeeId, date, time, status, note } = req.body;
    if (!employeeId || !date || !time || !status) {
      return res
        .status(400)
        .json({ message: "employeeId, date, time, and status are required." });
    }
    if (!LEGACY_EVENT_TYPES.includes(status)) {
      return res.status(400).json({ message: "Invalid punch type provided." });
    }

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const attendanceDate = normalizeDate(date);
    let attendance = await Attendance.findOne({
      employeeId,
      date: attendanceDate,
    });

    if (!attendance) {
      attendance = new Attendance({
        employeeId,
        date: attendanceDate,
        source: "manual",
        createdBy: req.user._id,
        note: note || "",
        events: [],
      });
    }

    attendance.source = "manual";
    attendance.createdBy = req.user._id;
    attendance.note = note || attendance.note;
    attendance.events.push({
      type: status,
      time: normalizeTime(time),
      note: note || "",
      source: "manual",
      createdBy: req.user._id,
      rawTimestamp: combineDateAndTime(attendanceDate, time),
    });

    syncAttendanceFromEvents(attendance);
    await attendance.save();
    await attendance.populate(
      "employeeId",
      "employeeId name email department designation position fingerprintId",
    );

    const latestEvent =
      sortEvents(attendance.events).find(
        (event) => event.time === normalizeTime(time) && event.type === status,
      ) || attendance.events[attendance.events.length - 1];

    return res.status(201).json({
      log: buildLegacyLog(attendance, latestEvent, attendance.employeeId),
      message: "Attendance entry added successfully.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function listAttendance(req, res) {
  try {
    const { employeeId, month, year, status, department } = req.query;
    const page = Number.parseInt(req.query.page || "1", 10);
    const limit = Number.parseInt(req.query.limit || "20", 10);
    const skip = (page - 1) * limit;
    const query = { ...(await getScopedEmployeeFilter(req, department)) };

    if (req.user.role === "hr" && employeeId) query.employeeId = employeeId;
    if (status) query.status = status;
    if (month && year) {
      query.date = {
        $gte: startOfMonth(Number(year), Number(month)),
        $lte: endOfMonth(Number(year), Number(month)),
      };
    }

    const [records, total] = await Promise.all([
      Attendance.find(query)
        .populate(
          "employeeId",
          "employeeId name email department designation position fingerprintId",
        )
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Attendance.countDocuments(query),
    ]);

    return res.json({
      records: attachEmployeeAlias(records),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function createAttendanceRecord(req, res) {
  try {
    const { employeeId, date, checkIn, checkOut, status, note } = req.body;
    if (!employeeId || !date) {
      return res
        .status(400)
        .json({ message: "employeeId and date are required." });
    }

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const attendance = await upsertDailyAttendance({
      employeeId,
      date,
      checkIn,
      checkOut,
      status,
      note,
      source: "manual",
      createdBy: req.user._id,
    });

    await attendance.populate(
      "employeeId",
      "employeeId name email department designation position fingerprintId",
    );

    return res.status(201).json({
      attendance: buildDailyRecordResponse(attendance),
      message: "Attendance record saved successfully.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function updateAttendanceRecord(req, res) {
  try {
    const directRecord = await Attendance.findById(req.params.id);

    if (directRecord) {
      const { employeeId, date, checkIn, checkOut, status, note } = req.body;
      if (employeeId) {
        const employee = await User.findById(employeeId);
        if (!employee)
          return res.status(404).json({ message: "Employee not found." });
        directRecord.employeeId = employeeId;
      }
      if (date) directRecord.date = normalizeDate(date);
      if (note !== undefined) directRecord.note = note;
      if (status && DAILY_STATUSES.includes(status))
        directRecord.status = status;
      if (checkIn !== undefined) directRecord.checkIn = normalizeTime(checkIn);
      if (checkOut !== undefined)
        directRecord.checkOut = normalizeTime(checkOut);

      if (checkIn !== undefined) {
        upsertEvent(directRecord, "check-in", checkIn, {
          source: directRecord.source,
          createdBy: directRecord.createdBy,
          note: directRecord.note,
          rawTimestamp: combineDateAndTime(directRecord.date, checkIn),
        });
      }
      if (checkOut !== undefined) {
        upsertEvent(directRecord, "check-out", checkOut, {
          source: directRecord.source,
          createdBy: directRecord.createdBy,
          note: directRecord.note,
          rawTimestamp: combineDateAndTime(directRecord.date, checkOut),
        });
      }

      syncAttendanceFromEvents(directRecord);
      await directRecord.save();
      await directRecord.populate(
        "employeeId",
        "employeeId name email department designation position fingerprintId",
      );

      return res.json({
        attendance: buildDailyRecordResponse(directRecord),
        message: "Attendance record updated successfully.",
      });
    }

    const parentRecord = await Attendance.findOne({
      "events._id": req.params.id,
    });
    if (!parentRecord) {
      return res.status(404).json({ message: "Attendance record not found." });
    }

    const event = parentRecord.events.id(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Attendance event not found." });
    }

    const targetDate = normalizeDate(req.body.date || parentRecord.date);
    const targetTime = normalizeTime(req.body.time || event.time);
    const targetStatus = req.body.status || event.type;
    if (!LEGACY_EVENT_TYPES.includes(targetStatus)) {
      return res.status(400).json({ message: "Invalid punch type provided." });
    }

    const eventData = {
      type: targetStatus,
      time: targetTime,
      note: req.body.note !== undefined ? req.body.note : event.note,
      source: event.source,
      createdBy: event.createdBy,
      rawTimestamp: combineDateAndTime(targetDate, targetTime),
    };

    parentRecord.events = parentRecord.events.filter(
      (entry) => entry._id.toString() !== req.params.id,
    );
    syncAttendanceFromEvents(parentRecord);

    if (
      !parentRecord.events.length &&
      ["present", "late", "absent"].includes(parentRecord.status)
    ) {
      await Attendance.deleteOne({ _id: parentRecord._id });
    } else {
      await parentRecord.save();
    }

    let targetRecord = await Attendance.findOne({
      employeeId: parentRecord.employeeId,
      date: targetDate,
    });
    if (!targetRecord) {
      targetRecord = new Attendance({
        employeeId: parentRecord.employeeId,
        date: targetDate,
        source: "manual",
        createdBy: req.user._id,
        note: eventData.note || "",
        events: [],
      });
    }

    targetRecord.events.push(eventData);
    targetRecord.note = eventData.note || targetRecord.note;
    targetRecord.source = "manual";
    targetRecord.createdBy = req.user._id;
    syncAttendanceFromEvents(targetRecord);
    await targetRecord.save();
    await targetRecord.populate(
      "employeeId",
      "employeeId name email department designation position fingerprintId",
    );

    const savedEvent =
      sortEvents(targetRecord.events).find(
        (entry) => entry.time === targetTime && entry.type === targetStatus,
      ) || targetRecord.events[targetRecord.events.length - 1];

    return res.json({
      log: buildLegacyLog(targetRecord, savedEvent, targetRecord.employeeId),
      message: "Attendance updated successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({
          message: "Attendance already exists for this employee and date.",
        });
    }
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function deleteAttendanceRecord(req, res) {
  try {
    const directRecord = await Attendance.findById(req.params.id);
    if (directRecord) {
      await Attendance.deleteOne({ _id: directRecord._id });
      return res.json({ message: "Attendance record deleted successfully." });
    }

    const parentRecord = await Attendance.findOne({
      "events._id": req.params.id,
    });
    if (!parentRecord) {
      return res.status(404).json({ message: "Attendance record not found." });
    }

    parentRecord.events = parentRecord.events.filter(
      (event) => event._id.toString() !== req.params.id,
    );
    syncAttendanceFromEvents(parentRecord);

    if (
      !parentRecord.events.length &&
      ["present", "late", "absent"].includes(parentRecord.status)
    ) {
      await Attendance.deleteOne({ _id: parentRecord._id });
    } else {
      await parentRecord.save();
    }

    return res.json({ message: "Attendance entry deleted successfully." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function bulkUploadAttendance(req, res) {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "No file uploaded. Use form-data field 'file'." });
  }

  try {
    const rows = parseSpreadsheetRows(req.file);
    if (!rows.length) {
      return res.status(400).json({ message: "Uploaded file is empty." });
    }

    const columns = extractImportColumns(rows[0]);
    const employees = await User.find({ isActive: true }).select(
      "_id employeeId name email fingerprintId",
    );
    const employeeMap = {
      employeeId: new Map(),
      fingerprint: new Map(),
      email: new Map(),
      name: new Map(),
    };

    employees.forEach((employee) => {
      employeeMap.employeeId.set(
        String(employee.employeeId || "").toUpperCase(),
        employee,
      );
      if (
        employee.fingerprintId !== undefined &&
        employee.fingerprintId !== null
      ) {
        employeeMap.fingerprint.set(String(employee.fingerprintId), employee);
      }
      employeeMap.email.set(
        String(employee.email || "").toLowerCase(),
        employee,
      );
      employeeMap.name.set(String(employee.name || "").toLowerCase(), employee);
    });

    let inserted = 0;
    let skipped = 0;
    let unmapped = 0;
    const unmappedIds = new Set();
    const errors = [];
    const importSource = getImportSource(req.file.originalname);

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const employee = await findEmployeeByAnyIdentifier(
        row,
        columns,
        employeeMap,
      );
      if (!employee) {
        unmapped += 1;
        unmappedIds.add(
          String(
            (columns.employeeId && row[columns.employeeId]) ||
              `row-${index + 2}`,
          ),
        );
        continue;
      }

      const date = parseImportedDate(
        columns.date ? row[columns.date] : "",
        columns.timestamp ? row[columns.timestamp] : "",
      );
      if (!date) {
        skipped += 1;
        errors.push(`Row ${index + 2}: unable to parse the attendance date.`);
        continue;
      }

      try {
        const checkIn = columns.checkIn ? row[columns.checkIn] : "";
        const checkOut = columns.checkOut ? row[columns.checkOut] : "";

        if (checkIn || checkOut) {
          await upsertDailyAttendance({
            employeeId: employee._id,
            date,
            checkIn,
            checkOut,
            source: "excel",
            createdBy: req.user._id,
            rawEmployeeCode: columns.employeeId
              ? String(row[columns.employeeId] || "")
              : "",
            note: `Imported from ${req.file.originalname}`,
          });
        } else {
          const eventType = resolveDirectionToType(
            columns.direction ? row[columns.direction] : "",
          );
          const eventTime = columns.time
            ? row[columns.time]
            : columns.timestamp
              ? row[columns.timestamp]
              : "";
          if (!normalizeTime(eventTime)) {
            skipped += 1;
            errors.push(`Row ${index + 2}: unable to parse time.`);
            continue;
          }

          let attendance = await Attendance.findOne({
            employeeId: employee._id,
            date,
          });
          if (!attendance) {
            attendance = new Attendance({
              employeeId: employee._id,
              date,
              source: "excel",
              createdBy: req.user._id,
              note: `Imported from ${req.file.originalname}`,
              rawEmployeeCode: columns.employeeId
                ? String(row[columns.employeeId] || "")
                : "",
              events: [],
            });
          }

          const normalizedEventTime = normalizeTime(eventTime);
          const duplicateEvent = attendance.events.find(
            (event) =>
              event.type === eventType && event.time === normalizedEventTime,
          );
          if (duplicateEvent) {
            skipped += 1;
            continue;
          }

          attendance.events.push({
            type: eventType,
            time: normalizedEventTime,
            note: "",
            source: "excel",
            createdBy: req.user._id,
            rawTimestamp: combineDateAndTime(date, normalizedEventTime),
          });
          attendance.source = "excel";
          attendance.createdBy = req.user._id;
          syncAttendanceFromEvents(attendance);
          await attendance.save();
        }

        inserted += 1;
      } catch (error) {
        skipped += 1;
        errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    await SyncLog.create({
      source: importSource,
      fileName: req.file.originalname,
      recordsFetched: rows.length,
      recordsInserted: inserted,
      recordsSkipped: skipped,
      recordsUnmapped: unmapped,
      status:
        inserted > 0
          ? skipped > 0 || unmapped > 0
            ? "partial"
            : "success"
          : "failed",
      errorMessage: errors.slice(0, 5).join(" | "),
      unmappedIds: [...unmappedIds],
      importedBy: req.user._id,
    });

    return res.json({
      message: `Import complete: ${inserted} records processed, ${skipped} skipped, ${unmapped} unmapped.`,
      inserted,
      skipped,
      unmapped,
      unmappedIds: [...unmappedIds],
      errors: errors.slice(0, 20),
      totalRows: rows.length,
    });
  } catch (error) {
    return res
      .status(400)
      .json({
        message: "Failed to parse the uploaded file.",
        error: error.message,
      });
  }
}

async function legacyImportCsv(req, res) {
  return bulkUploadAttendance(req, res);
}

async function legacyDailyReport(req, res) {
  try {
    const date = req.query.date
      ? normalizeDate(req.query.date)
      : normalizeDate(new Date());
    const page = Number.parseInt(req.query.page || "1", 10);
    const limit = Number.parseInt(req.query.limit || "50", 10);
    const query = {
      ...(await getScopedEmployeeFilter(req, req.query.department)),
      date: { $gte: startOfDay(date), $lte: endOfDay(date) },
    };

    const records = await Attendance.find(query)
      .populate(
        "employeeId",
        "employeeId name email department designation position fingerprintId",
      )
      .sort({ date: 1 });

    const logs = records.flatMap((record) => {
      const events = sortEvents(record.events || []);
      if (!events.length) {
        return [buildLegacyLog(record, null, record.employeeId)];
      }
      return events.map((event) =>
        buildLegacyLog(record, event, record.employeeId),
      );
    });

    const skip = (page - 1) * limit;
    return res.json({
      logs: logs.slice(skip, skip + limit),
      pagination: {
        page,
        limit,
        total: logs.length,
        pages: Math.ceil(logs.length / limit) || 1,
      },
      date: formatDateKey(date),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function legacyHistory(req, res) {
  try {
    if (
      req.user.role === "employee" &&
      req.params.employeeId !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const query = { employeeId: req.params.employeeId };
    if (req.query.startDate || req.query.endDate) {
      query.date = {};
      if (req.query.startDate)
        query.date.$gte = startOfDay(req.query.startDate);
      if (req.query.endDate) query.date.$lte = endOfDay(req.query.endDate);
    }

    const page = Number.parseInt(req.query.page || "1", 10);
    const limit = Number.parseInt(req.query.limit || "50", 10);

    const [records, employee] = await Promise.all([
      Attendance.find(query)
        .populate(
          "employeeId",
          "employeeId name email department designation position fingerprintId",
        )
        .sort({ date: -1 }),
      User.findById(req.params.employeeId).select(
        "employeeId name email department designation position fingerprintId phone salary doj",
      ),
    ]);

    const logs = records.flatMap((record) => {
      const events = sortEvents(record.events || []).reverse();
      if (!events.length) {
        return [buildLegacyLog(record, null, record.employeeId)];
      }
      return events.map((event) =>
        buildLegacyLog(record, event, record.employeeId),
      );
    });

    const skip = (page - 1) * limit;
    return res.json({
      employee,
      logs: logs.slice(skip, skip + limit),
      pagination: {
        page,
        limit,
        total: logs.length,
        pages: Math.ceil(logs.length / limit) || 1,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

// ── Monthly pivot-table upload ────────────────────────────────────────────────
// Supports TWO formats — auto-detected from the file contents:
//
// Format A – Combined cell (this device's export):
//   Header row : "Emp Code | Emp Name | 1 | 2 | … | 31"
//   One row per employee.  Each day cell holds BOTH punches:
//     "09:41\n19:21"  → check-in 09:41, check-out 19:21
//     "09:41"         → check-in only  (if time < 14:00)
//     "19:21"         → check-out only (if time ≥ 14:00, no in-time recorded)
//     "A"             → absent  (record stored with status=absent, no times)
//     "WO-I" / "WO"  → week-off / holiday  (skipped entirely)
//
// Format B – Split row (legacy):
//   Header row : same as above
//   Two rows per employee:  Row 1 = check-in times, Row 2 = check-out times
//
// Body params: month (1-12), year (YYYY)
//   If omitted or invalid, the function tries to parse them from the file title row
//   (e.g. "For the Month of : March/2026").
async function monthlyUploadAttendance(req, res) {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "No file uploaded. Use form-data field 'file'." });
  }

  // ── Month / year resolution ────────────────────────────────────────────────
  let month = Number.parseInt(req.body.month, 10);
  let year = Number.parseInt(req.body.year, 10);

  try {
    const workbook = xlsx.read(req.file.buffer, {
      type: "buffer",
      cellDates: false,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    // ── Try to parse month/year from the title row if not supplied ─────────────
    if (!month || !year || month < 1 || month > 12) {
      const MONTH_NAMES = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12,
      };
      for (let i = 0; i < Math.min(5, rawRows.length); i += 1) {
        const rowText = rawRows[i]
          .map((c) => String(c || ""))
          .join(" ")
          .toLowerCase();
        // Pattern: "March/2026" or "03/2026" or "March 2026"
        const nameMatch = rowText.match(
          /\b(january|february|march|april|may|june|july|august|september|october|november|december)[\/\s-](\d{4})\b/,
        );
        if (nameMatch) {
          month = MONTH_NAMES[nameMatch[1]];
          year = Number.parseInt(nameMatch[2], 10);
          break;
        }
        const numMatch = rowText.match(/\b(0?[1-9]|1[0-2])[\/\-](\d{4})\b/);
        if (numMatch) {
          month = Number.parseInt(numMatch[1], 10);
          year = Number.parseInt(numMatch[2], 10);
          break;
        }
      }
    }

    if (!month || !year || month < 1 || month > 12) {
      return res.status(400).json({
        message:
          "Could not determine month/year. Provide them as 'month' and 'year' in the request body, " +
          "or ensure the file title row contains text like 'March/2026'.",
      });
    }

    // ── Locate header row ──────────────────────────────────────────────────────
    let headerRowIndex = -1;
    let headerRow = [];
    for (let i = 0; i < rawRows.length; i += 1) {
      const joined = rawRows[i]
        .map((c) =>
          String(c || "")
            .toLowerCase()
            .trim(),
        )
        .join("|");
      if (
        joined.includes("emp code") ||
        joined.includes("emp name") ||
        joined.includes("employee code")
      ) {
        headerRowIndex = i;
        headerRow = rawRows[i];
        break;
      }
    }
    if (headerRowIndex === -1) {
      return res.status(400).json({
        message:
          "Header row with 'Emp Code' / 'Emp Name' not found. " +
          "Make sure the file matches the monthly attendance report format.",
      });
    }

    // ── Resolve column positions ───────────────────────────────────────────────
    const empCodeCol = headerRow.findIndex((h) =>
      [
        "emp code",
        "employee code",
        "empcode",
        "emp_code",
        "card no",
        "cardno",
      ].includes(
        String(h || "")
          .toLowerCase()
          .trim(),
      ),
    );
    const empNameCol = headerRow.findIndex((h) =>
      ["emp name", "employee name", "name"].includes(
        String(h || "")
          .toLowerCase()
          .trim(),
      ),
    );

    // Day columns: cells whose value is a whole number 1-31.
    // Handles both integer strings ("1", "31") and float strings ("1.0", "3.0")
    // that some xlsx readers emit for merged-cell headers.
    const dayColumns = {};
    headerRow.forEach((cell, idx) => {
      const val = String(cell || "").trim();
      const n = Number(val);
      if (
        !Number.isNaN(n) &&
        Number.isFinite(n) &&
        n >= 1 &&
        n <= 31 &&
        n === Math.floor(n)
      ) {
        // Use the integer value as the key so "1.0" and "1" both map to day 1
        if (!dayColumns[n]) dayColumns[n] = idx;
      }
    });

    if (Object.keys(dayColumns).length === 0) {
      return res
        .status(400)
        .json({ message: "No day columns (1-31) found in the header row." });
    }

    // ── Detect format ──────────────────────────────────────────────────────────
    // Format A (combined): at least one day cell in the first data row contains \n
    // Format B (split):    no \n in day cells → 2 rows per employee
    const dataRows = rawRows.slice(headerRowIndex + 1);

    let isCombinedFormat = false;
    for (let i = 0; i < Math.min(10, dataRows.length); i += 1) {
      const row = dataRows[i];
      for (const colIdx of Object.values(dayColumns)) {
        if (String(row[colIdx] || "").includes("\n")) {
          isCombinedFormat = true;
          break;
        }
      }
      if (isCombinedFormat) break;
    }

    // ── Build employee lookup maps ─────────────────────────────────────────────
    const employees = await User.find({ isActive: true })
      .select("_id employeeId name email fingerprintId")
      .lean();

    const byFingerprint = new Map();
    const byName = new Map();
    const byEmpId = new Map();
    employees.forEach((emp) => {
      if (emp.fingerprintId != null)
        byFingerprint.set(String(emp.fingerprintId), emp);
      byName.set(
        String(emp.name || "")
          .toLowerCase()
          .trim(),
        emp,
      );
      if (emp.employeeId)
        byEmpId.set(String(emp.employeeId).toUpperCase(), emp);
    });

    // ── Helpers ────────────────────────────────────────────────────────────────
    const SKIP_VALUES = new Set(["na", "wo-i", "wo", "woff", "off", "-", ""]);
    const ABSENT_VALUES = new Set(["a", "abs", "absent"]);

    // Given a raw cell string from the combined format, return { checkIn, checkOut, isAbsent, skip }
    function parseCombinedCell(raw) {
      const trimmed = raw.trim();
      const lower = trimmed.toLowerCase();

      if (!trimmed || SKIP_VALUES.has(lower)) return { skip: true };
      if (ABSENT_VALUES.has(lower)) return { isAbsent: true };

      if (trimmed.includes("\n")) {
        // Both punches present
        const parts = trimmed.split("\n");
        const checkIn = normalizeTime(parts[0].trim());
        const checkOut = normalizeTime(parts[1].trim());
        return {
          checkIn: checkIn || undefined,
          checkOut: checkOut || undefined,
        };
      }

      // Single punch — decide based on time value
      const t = normalizeTime(trimmed);
      if (!t) return { skip: true };

      const [hours] = t.split(":").map(Number);
      // If hour is in "likely check-out" territory treat it as out-time
      if (hours >= 14) {
        return { checkOut: t };
      }
      return { checkIn: t };
    }

    // ── Process rows ───────────────────────────────────────────────────────────
    let inserted = 0;
    let skipped = 0;
    let unmapped = 0;
    const unmappedIds = new Set();
    const errors = [];

    if (isCombinedFormat) {
      // ── Format A: one row per employee, combined cells ───────────────────────
      for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx += 1) {
        const row = dataRows[rowIdx];
        const empCodeRaw =
          empCodeCol >= 0 ? String(row[empCodeCol] || "").trim() : "";
        const empNameRaw =
          empNameCol >= 0 ? String(row[empNameCol] || "").trim() : "";

        if (!empCodeRaw && !empNameRaw) continue; // blank separator row

        // Employee lookup:
        // In this format Emp Code is a sequential row-number, NOT a system EmpID.
        // Try fingerprint first (in case some exports DO use the card number),
        // then fall back to name, then empId.
        let employee = null;
        const fpNum = Number(empCodeRaw);
        if (Number.isInteger(fpNum) && fpNum > 0)
          employee = byFingerprint.get(String(fpNum));
        if (!employee && empNameRaw)
          employee = byName.get(empNameRaw.toLowerCase().trim());
        if (!employee && empCodeRaw)
          employee = byEmpId.get(empCodeRaw.toUpperCase());

        if (!employee) {
          unmapped += 1;
          unmappedIds.add(empNameRaw || empCodeRaw);
          continue;
        }

        for (const [dayStr, colIdx] of Object.entries(dayColumns)) {
          const dayNum = Number(dayStr);
          const cellRaw = String(row[colIdx] || "").trim();
          const parsed = parseCombinedCell(cellRaw);

          if (parsed.skip) continue;

          // Guard against invalid calendar dates (e.g. Feb 30)
          const dateObj = new Date(year, month - 1, dayNum);
          if (dateObj.getMonth() !== month - 1) continue;

          try {
            if (parsed.isAbsent) {
              await upsertDailyAttendance({
                employeeId: employee._id,
                date: dateObj,
                status: "absent",
                source: "excel",
                createdBy: req.user._id,
                rawEmployeeCode: empCodeRaw,
                note: `Monthly import – ${req.file.originalname}`,
              });
            } else {
              // Only create a record if we have at least one valid time
              if (!parsed.checkIn && !parsed.checkOut) {
                skipped += 1;
                continue;
              }
              await upsertDailyAttendance({
                employeeId: employee._id,
                date: dateObj,
                checkIn: parsed.checkIn,
                checkOut: parsed.checkOut,
                source: "excel",
                createdBy: req.user._id,
                rawEmployeeCode: empCodeRaw,
                note: `Monthly import – ${req.file.originalname}`,
              });
            }
            inserted += 1;
          } catch (err) {
            skipped += 1;
            errors.push(
              `${empNameRaw || empCodeRaw} Day ${dayNum}: ${err.message}`,
            );
          }
        }
      }
    } else {
      // ── Format B: two rows per employee (legacy split format) ────────────────
      let rowIdx = 0;
      while (rowIdx < dataRows.length) {
        const checkInRow = dataRows[rowIdx];
        const empCodeRaw =
          empCodeCol >= 0 ? String(checkInRow[empCodeCol] || "").trim() : "";
        const empNameRaw =
          empNameCol >= 0 ? String(checkInRow[empNameCol] || "").trim() : "";

        if (!empCodeRaw && !empNameRaw) {
          rowIdx += 1;
          continue;
        }

        const nextRow = dataRows[rowIdx + 1] || [];
        const nextCode =
          empCodeCol >= 0 ? String(nextRow[empCodeCol] || "").trim() : "";
        const nextName =
          empNameCol >= 0 ? String(nextRow[empNameCol] || "").trim() : "";
        const hasPairedRow = !nextCode && !nextName;
        const checkOutRow = hasPairedRow ? nextRow : [];
        const advance = hasPairedRow ? 2 : 1;

        let employee = null;
        const fpNum = Number(empCodeRaw);
        if (Number.isInteger(fpNum) && fpNum > 0)
          employee = byFingerprint.get(String(fpNum));
        if (!employee && empNameRaw)
          employee = byName.get(empNameRaw.toLowerCase());
        if (!employee && empCodeRaw)
          employee = byEmpId.get(empCodeRaw.toUpperCase());

        if (!employee) {
          unmapped += 1;
          unmappedIds.add(empCodeRaw || empNameRaw);
          rowIdx += advance;
          continue;
        }

        for (const [dayStr, colIdx] of Object.entries(dayColumns)) {
          const dayNum = Number(dayStr);
          const checkInRaw = String(checkInRow[colIdx] || "").trim();
          const checkOutRaw = String(checkOutRow[colIdx] || "").trim();

          if (SKIP_VALUES.has(checkInRaw.toLowerCase())) continue;
          if (ABSENT_VALUES.has(checkInRaw.toLowerCase())) {
            const dateObj = new Date(year, month - 1, dayNum);
            if (dateObj.getMonth() !== month - 1) continue;
            try {
              await upsertDailyAttendance({
                employeeId: employee._id,
                date: dateObj,
                status: "absent",
                source: "excel",
                createdBy: req.user._id,
                rawEmployeeCode: empCodeRaw,
                note: `Monthly import – ${req.file.originalname}`,
              });
              inserted += 1;
            } catch (err) {
              skipped += 1;
              errors.push(`${empNameRaw} Day ${dayNum}: ${err.message}`);
            }
            continue;
          }

          const checkIn = normalizeTime(checkInRaw);
          if (!checkIn) {
            skipped += 1;
            continue;
          }
          const checkOut = normalizeTime(checkOutRaw) || undefined;

          const dateObj = new Date(year, month - 1, dayNum);
          if (dateObj.getMonth() !== month - 1) continue;

          try {
            await upsertDailyAttendance({
              employeeId: employee._id,
              date: dateObj,
              checkIn,
              checkOut,
              source: "excel",
              createdBy: req.user._id,
              rawEmployeeCode: empCodeRaw,
              note: `Monthly import – ${req.file.originalname}`,
            });
            inserted += 1;
          } catch (err) {
            skipped += 1;
            errors.push(
              `${empNameRaw || empCodeRaw} Day ${dayNum}: ${err.message}`,
            );
          }
        }

        rowIdx += advance;
      }
    }

    // ── Sync log ───────────────────────────────────────────────────────────────
    await SyncLog.create({
      source: "excel-upload",
      fileName: req.file.originalname,
      recordsFetched: dataRows.length,
      recordsInserted: inserted,
      recordsSkipped: skipped,
      recordsUnmapped: unmapped,
      status:
        inserted > 0
          ? skipped > 0 || unmapped > 0
            ? "partial"
            : "success"
          : "failed",
      errorMessage: errors.slice(0, 5).join(" | "),
      unmappedIds: [...unmappedIds],
      importedBy: req.user._id,
    });

    return res.json({
      message: `Monthly import complete: ${inserted} day records inserted, ${skipped} skipped, ${unmapped} employee(s) unmapped.`,
      inserted,
      skipped,
      unmapped,
      unmappedIds: [...unmappedIds],
      errors: errors.slice(0, 20),
      month,
      year,
    });
  } catch (error) {
    return res
      .status(400)
      .json({
        message: "Failed to parse the monthly attendance file.",
        error: error.message,
      });
  }
}

async function getImportLogs(req, res) {
  try {
    const logs = await SyncLog.find()
      .populate("importedBy", "employeeId name email")
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json({ logs });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function getAttendanceStats(req, res) {
  try {
    const today = normalizeDate(new Date());
    const query =
      req.user.role === "employee" ? { employeeId: req.user._id } : {};
    const [recordsToday, totalRecords, lastImport] = await Promise.all([
      Attendance.find({
        ...query,
        date: { $gte: startOfDay(today), $lte: endOfDay(today) },
      }).lean(),
      Attendance.countDocuments(query),
      SyncLog.findOne().sort({ createdAt: -1 }),
    ]);

    return res.json({
      todayPresent: recordsToday.filter((record) =>
        ["present", "late", "half-day"].includes(record.status),
      ).length,
      todayPunches: recordsToday.reduce(
        (count, record) => count + (record.events?.length || 0),
        0,
      ),
      totalRecords,
      lastImport: lastImport ? lastImport.createdAt : null,
      lastImportStatus: lastImport ? lastImport.status : null,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

async function getMyMonthlyAttendance(req, res) {
  try {
    const month = Number.parseInt(req.params.month, 10);
    const year = Number.parseInt(req.params.year, 10);
    const range = {
      $gte: startOfMonth(year, month),
      $lte: endOfMonth(year, month),
    };

    const [records, holidays] = await Promise.all([
      Attendance.find({ employeeId: req.user._id, date: range }).sort({
        date: 1,
      }),
      Holiday.find({ date: range }).sort({ date: 1 }),
    ]);

    return res.json({
      month,
      year,
      records: records.map(buildDailyRecordResponse),
      holidays,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
}

// ── Daily Biometric / Detailed XLS upload ────────────────────────────────────
// Handles the "Date wise Daily Attendance Report (Detailed)" format exported
// from fingerprint / biometric devices.
//
// File layout
//   Rows 0-N    : Report title, company, date metadata (skip)
//   Header row  : Merged-cell row containing  S No | EMP Code | Card No |
//                 Emp Name | Shift Start | Shift End | In Time | Out Time |
//                 Shift Hrs | Work Hrs | OT Hrs | … | Status
//   Data rows   : One employee per pair of rows (odd rows are blank separators)
//
// Column values are placed at the LEFT-MOST cell of each merged block, so we
// search the raw header row for the target text and use that column index.
//
// Status mapping
//   P           → present
//   MIS         → present  (check-in exists, check-out missing)
//   HD          → half-day
//   A           → absent
//   WO / WO-I   → skip     (weekend / week-off, not a working day)
//   anything else → skip
// Parse "DD/MM/YYYY" (Indian format used by fingerprint reports).
// Returns a Date at local midnight, or null if invalid.
function parseIndianDate(str) {
  const match = String(str || "")
    .trim()
    .match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number.parseInt(dd, 10);
  const month = Number.parseInt(mm, 10);
  const year = Number.parseInt(yyyy, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Scan the metadata rows above the data header for a report-level date such as
//   "Date : 06/04/2026"  or  "On Dated : 06/04/2026"
// This is the fallback when In Time / Out Time cells are time-only.
function extractReportDate(rawRows, beforeIdx) {
  for (let i = 0; i < beforeIdx; i += 1) {
    for (const cell of rawRows[i] || []) {
      const parsed = parseIndianDate(cell);
      if (parsed) return parsed;
    }
  }
  return null;
}

// Combine a time-only string ("9:51", "19:06") with a base date. Returns an
// object { date, time } where date is normalized midnight and time is "HH:MM".
// Returns null if neither the cell itself nor the fallback date produce a
// valid datetime.
function resolvePunchDateTime(cellValue, fallbackDate) {
  const str = String(cellValue || "").trim();
  if (!str) return null;

  // Try full datetime first (e.g. "2026-04-06 09:51:00").
  const fullParsed = new Date(str);
  if (!Number.isNaN(fullParsed.getTime()) && /\d{4}|T|-/.test(str)) {
    return {
      date: normalizeDate(fullParsed),
      time: normalizeTime(fullParsed),
    };
  }

  // Time-only value: combine with the report date from metadata.
  const time = normalizeTime(str);
  if (time && fallbackDate) {
    return { date: normalizeDate(fallbackDate), time };
  }

  return null;
}

async function dailyDetailedUpload(req, res) {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "No file uploaded. Use form-data field 'file'." });
  }

  try {
    // ── Parse raw 2-D array ────────────────────────────────────────────────
    const workbook = xlsx.read(req.file.buffer, {
      type: "buffer",
      cellDates: false,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    // ── Locate header row ──────────────────────────────────────────────────
    let headerRowIdx = -1;
    let headerRow = [];
    for (let i = 0; i < rawRows.length; i += 1) {
      const joined = rawRows[i]
        .map((c) =>
          String(c || "")
            .toLowerCase()
            .trim(),
        )
        .join("|");
      if (
        joined.includes("emp code") ||
        joined.includes("card no") ||
        joined.includes("in time")
      ) {
        headerRowIdx = i;
        headerRow = rawRows[i];
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).json({
        message:
          "Could not find header row. Expected columns like 'EMP Code', 'Card No', 'In Time', 'Out Time'. " +
          "Make sure the file is a biometric daily attendance report.",
      });
    }

    // Report-level date from metadata rows (e.g. "Date : 06/04/2026").
    // Used as fallback when punch cells contain only "HH:MM".
    const reportDate = extractReportDate(rawRows, headerRowIdx);

    // ── Resolve column positions dynamically ───────────────────────────────
    const normalize = (v) =>
      String(v || "")
        .toLowerCase()
        .trim();

    const colIdx = (aliases) => {
      const idx = headerRow.findIndex((h) => aliases.includes(normalize(h)));
      return idx >= 0 ? idx : null;
    };

    const COL = {
      empCode: colIdx(["emp code", "employee code", "empcode", "emp_code"]),
      cardNo: colIdx(["card no", "cardno", "card_no", "card number"]),
      empName: colIdx(["emp name", "employee name", "name"]),
      inTime: colIdx([
        "in time",
        "intime",
        "in_time",
        "checkin",
        "check in",
        "check-in",
      ]),
      outTime: colIdx([
        "out time",
        "outtime",
        "out_time",
        "checkout",
        "check out",
        "check-out",
      ]),
      status: colIdx(["status"]),
    };

    if (COL.inTime === null) {
      return res.status(400).json({
        message: "Required column 'In Time' not found in header row.",
      });
    }

    // ── Build employee lookup maps ─────────────────────────────────────────
    const employees = await User.find({ isActive: true })
      .select("_id employeeId name email fingerprintId")
      .lean();

    const byCardNo = new Map();
    const byEmpCode = new Map();
    const byName = new Map();

    employees.forEach((emp) => {
      if (emp.fingerprintId != null && emp.fingerprintId !== "") {
        byCardNo.set(String(emp.fingerprintId).trim(), emp);
      }
      if (emp.employeeId) {
        byEmpCode.set(String(emp.employeeId).toUpperCase().trim(), emp);
      }
      byName.set(
        String(emp.name || "")
          .toLowerCase()
          .trim(),
        emp,
      );
    });

    // ── Process data rows ──────────────────────────────────────────────────
    const STATUS_SKIP = new Set(["wo", "wo-i", "woff", "off", ""]);
    const STATUS_MAP = {
      p: "present",
      mis: "present",
      hd: "half-day",
      a: "absent",
    };

    const dataRows = rawRows.slice(headerRowIdx + 1);
    let inserted = 0;
    let skipped = 0;
    let unmapped = 0;
    const unmappedIds = new Set();
    const errors = [];

    for (let idx = 0; idx < dataRows.length; idx += 1) {
      const row = dataRows[idx];

      // ── Extract raw values ───────────────────────────────────────────────
      const empCodeRaw =
        COL.empCode !== null ? String(row[COL.empCode] || "").trim() : "";
      const cardNoRaw =
        COL.cardNo !== null ? String(row[COL.cardNo] || "").trim() : "";
      const empNameRaw =
        COL.empName !== null ? String(row[COL.empName] || "").trim() : "";
      const inTimeRaw = String(row[COL.inTime] || "").trim();
      const outTimeRaw =
        COL.outTime !== null ? String(row[COL.outTime] || "").trim() : "";
      const statusRaw =
        COL.status !== null
          ? String(row[COL.status] || "")
              .trim()
              .toLowerCase()
          : "";

      // Skip blank / separator rows (no employee identifier AND no in-time)
      if (!empCodeRaw && !cardNoRaw && !empNameRaw && !inTimeRaw) {
        continue;
      }

      // Skip weekend / week-off rows
      if (STATUS_SKIP.has(statusRaw)) {
        continue;
      }

      // ── Resolve employee ─────────────────────────────────────────────────
      let employee =
        (cardNoRaw ? byCardNo.get(cardNoRaw) : null) ||
        (empCodeRaw ? byEmpCode.get(empCodeRaw.toUpperCase()) : null) ||
        (empNameRaw ? byName.get(empNameRaw.toLowerCase()) : null);

      if (!employee) {
        unmapped += 1;
        unmappedIds.add(
          cardNoRaw ||
            empCodeRaw ||
            empNameRaw ||
            `row-${headerRowIdx + 2 + idx}`,
        );
        continue;
      }

      // ── Resolve attendance date & times ──────────────────────────────────
      // Cells may contain either a full datetime ("2026-04-06 09:51:00") or
      // just "HH:MM" (Secureye detailed report). In the time-only case we
      // combine with the report-level date from the metadata rows.
      const inPunch = resolvePunchDateTime(inTimeRaw, reportDate);
      const outPunch = resolvePunchDateTime(outTimeRaw, reportDate);

      const attendanceDate =
        inPunch?.date || outPunch?.date || (reportDate ? normalizeDate(reportDate) : null);
      const checkInTime = inPunch?.time || "";
      const checkOutTime = outPunch?.time || "";

      if (!attendanceDate) {
        skipped += 1;
        errors.push(
          `Row ${headerRowIdx + 2 + idx} (${empNameRaw || empCodeRaw}): could not determine attendance date. ` +
            `In Time='${inTimeRaw}', Out Time='${outTimeRaw}'. Ensure the report header contains a 'Date : DD/MM/YYYY' cell.`,
        );
        continue;
      }

      // ── Map status ───────────────────────────────────────────────────────
      const mappedStatus = STATUS_MAP[statusRaw] || null;

      // Absent rows: insert absence record with no times
      if (mappedStatus === "absent" || (!checkInTime && statusRaw === "a")) {
        try {
          await upsertDailyAttendance({
            employeeId: employee._id,
            date: attendanceDate,
            status: "absent",
            source: "excel",
            createdBy: req.user._id,
            rawEmployeeCode: cardNoRaw || empCodeRaw,
            note: `Daily import – ${req.file.originalname}`,
          });
          inserted += 1;
        } catch (err) {
          skipped += 1;
          errors.push(`${empNameRaw || empCodeRaw}: ${err.message}`);
        }
        continue;
      }

      // Present / MIS / half-day rows
      if (!checkInTime) {
        skipped += 1;
        errors.push(
          `Row ${headerRowIdx + 2 + idx} (${empNameRaw || empCodeRaw}): no valid In Time found, skipping.`,
        );
        continue;
      }

      try {
        await upsertDailyAttendance({
          employeeId: employee._id,
          date: attendanceDate,
          checkIn: checkInTime,
          checkOut: checkOutTime || undefined,
          status: mappedStatus || undefined,
          source: "excel",
          createdBy: req.user._id,
          rawEmployeeCode: cardNoRaw || empCodeRaw,
          note: `Daily import – ${req.file.originalname}`,
        });
        inserted += 1;
      } catch (err) {
        skipped += 1;
        errors.push(`${empNameRaw || empCodeRaw}: ${err.message}`);
      }
    }

    // ── Persist sync log ───────────────────────────────────────────────────
    await SyncLog.create({
      source: "excel-upload",
      fileName: req.file.originalname,
      recordsFetched: dataRows.length,
      recordsInserted: inserted,
      recordsSkipped: skipped,
      recordsUnmapped: unmapped,
      status:
        inserted > 0
          ? skipped > 0 || unmapped > 0
            ? "partial"
            : "success"
          : "failed",
      errorMessage: errors.slice(0, 5).join(" | "),
      unmappedIds: [...unmappedIds],
      importedBy: req.user._id,
    });

    return res.json({
      message: `Daily import complete: ${inserted} records inserted, ${skipped} skipped, ${unmapped} unmapped.`,
      inserted,
      skipped,
      unmapped,
      unmappedIds: [...unmappedIds],
      errors: errors.slice(0, 20),
      totalRows: dataRows.length,
    });
  } catch (error) {
    return res.status(400).json({
      message: "Failed to parse the daily attendance file.",
      error: error.message,
    });
  }
}

module.exports = {
  attendanceUpload,
  listAttendance,
  createAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  createManualAttendance,
  bulkUploadAttendance,
  monthlyUploadAttendance,
  dailyDetailedUpload,
  legacyImportCsv,
  legacyDailyReport,
  legacyHistory,
  getImportLogs,
  getAttendanceStats,
  getMyMonthlyAttendance,
};
