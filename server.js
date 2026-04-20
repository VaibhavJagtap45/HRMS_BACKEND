require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");

// ── Route modules ────────────────────────────────────────────────────────────
const authRoutes       = require("./routes/auth");
const employeeRoutes   = require("./routes/employees");
const attendanceRoutes = require("./routes/attendance");
const leaveRoutes      = require("./routes/leaves");
const payrollRoutes    = require("./routes/payroll");
const noticeRoutes     = require("./routes/notices");
const holidayRoutes    = require("./routes/holidays");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Allowed CORS origins ─────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
].filter(Boolean);

// ── Global middleware ────────────────────────────────────────────────────────
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin requests (no Origin header) and white-listed domains
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin '${origin}' is not allowed.`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.set("trust proxy", 1); // Required for express-rate-limit behind a reverse proxy

// ── API v1 routes ────────────────────────────────────────────────────────────
// Base URL: /api/v1  (all endpoints except /auth/* require Authorization: Bearer)
const API = "/api/v1";

app.use(`${API}/auth`,       authRoutes);
app.use(`${API}/employees`,  employeeRoutes);
app.use(`${API}/attendance`, attendanceRoutes);
app.use(`${API}/leaves`,     leaveRoutes);
app.use(`${API}/payroll`,    payrollRoutes);
app.use(`${API}/notices`,    noticeRoutes);
app.use(`${API}/holidays`,   holidayRoutes);

// Health-check (no auth required)
app.get(`${API}/health`, (_req, res) =>
  res.json({ status: "ok", version: "v1", timestamp: new Date().toISOString() }),
);

// ── Backwards-compatible /api alias ─────────────────────────────────────────
// Preserves existing frontend calls that use /api/* without the version prefix.
app.use("/api/auth",       authRoutes);
app.use("/api/employees",  employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves",     leaveRoutes);
app.use("/api/payroll",    payrollRoutes);
app.use("/api/notices",    noticeRoutes);
app.use("/api/holidays",   holidayRoutes);

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found.` }),
);

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[Server Error]", err);
  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error.",
  });
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`HRMS API  →  http://localhost:${PORT}${API}`);
    console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

module.exports = app;
