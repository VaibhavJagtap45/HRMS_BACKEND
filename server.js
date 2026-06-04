// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const morgan = require("morgan");
// const connectDB = require("./config/db");

// // ── Route modules ────────────────────────────────────────────────────────────
// const authRoutes       = require("./routes/auth");
// const employeeRoutes   = require("./routes/employees");
// const attendanceRoutes = require("./routes/attendance");
// const leaveRoutes      = require("./routes/leaves");
// const payrollRoutes    = require("./routes/payroll");
// const noticeRoutes     = require("./routes/notices");
// const holidayRoutes    = require("./routes/holidays");

// const app  = express();
// const PORT = process.env.PORT || 5000;

// // ── Allowed CORS origins ─────────────────────────────────────────────────────
// const allowedOrigins = [
//   process.env.CLIENT_URL,
//   "http://localhost:3000",
//   "http://127.0.0.1:3000",
//   "http://localhost:3001",
//   "http://127.0.0.1:3001",
// ].filter(Boolean);

// // ── Global middleware ────────────────────────────────────────────────────────
// app.use(
//   cors({
//     origin(origin, callback) {
//       // Allow same-origin requests (no Origin header) and white-listed domains
//       if (!origin || allowedOrigins.includes(origin)) {
//         return callback(null, true);
//       }
//       return callback(new Error(`CORS: origin '${origin}' is not allowed.`));
//     },
//     credentials: true,
//   }),
// );
// app.use(express.json({ limit: "2mb" }));
// app.use(express.urlencoded({ extended: true }));
// app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
// app.set("trust proxy", 1); // Required for express-rate-limit behind a reverse proxy

// // ── API v1 routes ────────────────────────────────────────────────────────────
// // Base URL: /api/v1  (all endpoints except /auth/* require Authorization: Bearer)
// const API = "/api/v1";

// app.use(`${API}/auth`,       authRoutes);
// app.use(`${API}/employees`,  employeeRoutes);
// app.use(`${API}/attendance`, attendanceRoutes);
// app.use(`${API}/leaves`,     leaveRoutes);
// app.use(`${API}/payroll`,    payrollRoutes);
// app.use(`${API}/notices`,    noticeRoutes);
// app.use(`${API}/holidays`,   holidayRoutes);

// // Health-check (no auth required)
// app.get(`${API}/health`, (_req, res) =>
//   res.json({ status: "ok", version: "v1", timestamp: new Date().toISOString() }),
// );

// // ── Backwards-compatible /api alias ─────────────────────────────────────────
// // Preserves existing frontend calls that use /api/* without the version prefix.
// app.use("/api/auth",       authRoutes);
// app.use("/api/employees",  employeeRoutes);
// app.use("/api/attendance", attendanceRoutes);
// app.use("/api/leaves",     leaveRoutes);
// app.use("/api/payroll",    payrollRoutes);
// app.use("/api/notices",    noticeRoutes);
// app.use("/api/holidays",   holidayRoutes);

// // ── 404 catch-all ────────────────────────────────────────────────────────────
// app.use((req, res) =>
//   res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found.` }),
// );

// // ── Global error handler ─────────────────────────────────────────────────────
// // eslint-disable-next-line no-unused-vars
// app.use((err, _req, res, _next) => {
//   console.error("[Server Error]", err);
//   res.status(err.statusCode || 500).json({
//     message: err.message || "Internal server error.",
//   });
// });

// // ── Bootstrap ────────────────────────────────────────────────────────────────
// async function startServer() {
//   await connectDB();
//   app.listen(PORT, () => {
//     console.log(`HRMS API  →  http://localhost:${PORT}${API}`);
//     console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
//   });
// }

// startServer().catch((err) => {
//   console.error("Failed to start server:", err);
//   process.exit(1);
// });

// module.exports = app;

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");

// Route modules
const authRoutes = require("./routes/auth");
const employeeRoutes = require("./routes/employees");
const attendanceRoutes = require("./routes/attendance");
const leaveRoutes = require("./routes/leaves");
const payrollRoutes = require("./routes/payroll");
const noticeRoutes = require("./routes/notices");
const holidayRoutes = require("./routes/holidays");

const app = express();
const PORT = process.env.PORT || 5000;

function normalizeOrigin(origin = "") {
  return String(origin).trim().replace(/\/$/, "");
}

function splitOrigins(value = "") {
  return String(value)
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

// Allowed origins. CLIENT_URL / FRONTEND_URL may contain one URL or a
// comma-separated list, which is handy when Vercel has preview deployments.
const allowedOrigins = [
  ...splitOrigins(process.env.CLIENT_URL),
  ...splitOrigins(process.env.FRONTEND_URL),
  "https://albos-hrms.vercel.app",
  "https://hrms.albostechnologies.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
].map(normalizeOrigin);

const allowedOriginSet = new Set(allowedOrigins);

function getAllowedOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return null;

  const isAllowed =
    allowedOriginSet.has(normalizedOrigin) ||
    /^https:\/\/albos-hrms(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(
      normalizedOrigin,
    ) ||
    // Production: apex + any subdomain of albostechnologies.com (hrms, www, ...)
    /^https:\/\/(?:[a-z0-9-]+\.)?albostechnologies\.com$/i.test(
      normalizedOrigin,
    );

  return isAllowed ? normalizedOrigin : null;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return Boolean(getAllowedOrigin(origin));
}

const corsMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const corsAllowedHeaders = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
];
const corsExposedHeaders = [
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
];

// CORS config
const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin header like Postman, server-to-server, mobile apps
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    const error = new Error(`CORS blocked for origin: ${origin}`);
    error.statusCode = 403;
    return callback(error);
  },
  credentials: true,
  methods: corsMethods,
  allowedHeaders: corsAllowedHeaders,
  exposedHeaders: corsExposedHeaders,
  optionsSuccessStatus: 204,
};

function setCorsHeaders(req, res) {
  const allowedOrigin = getAllowedOrigin(req.headers.origin);
  if (!allowedOrigin) return false;

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", corsMethods.join(", "));
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      corsAllowedHeaders.join(", "),
  );
  res.setHeader("Access-Control-Expose-Headers", corsExposedHeaders.join(", "));
  res.vary("Origin");
  res.vary("Access-Control-Request-Headers");
  return true;
}

// Global middleware
app.use((req, res, next) => {
  const hasCorsHeaders = setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    if (hasCorsHeaders || !req.headers.origin) {
      return res.sendStatus(204);
    }
    return res.status(403).json({ message: "CORS origin not allowed." });
  }

  return next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.set("trust proxy", 1);

// API prefix
const API = "/api";
const API_V1 = "/api/v1";

// Health check
app.get("/", (_req, res) => {
  res.json({
    message: "HRMS API is running",
    version: "v1",
    health: `${API_V1}/health`,
  });
});

app.get(`${API_V1}/health`, (_req, res) => {
  res.json({
    status: "ok",
    version: "v1",
    timestamp: new Date().toISOString(),
  });
});

// Versioned routes
app.use(`${API_V1}/auth`, authRoutes);
app.use(`${API_V1}/employees`, employeeRoutes);
app.use(`${API_V1}/attendance`, attendanceRoutes);
app.use(`${API_V1}/leaves`, leaveRoutes);
app.use(`${API_V1}/payroll`, payrollRoutes);
app.use(`${API_V1}/notices`, noticeRoutes);
app.use(`${API_V1}/holidays`, holidayRoutes);

// Backwards-compatible routes
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/employees`, employeeRoutes);
app.use(`${API}/attendance`, attendanceRoutes);
app.use(`${API}/leaves`, leaveRoutes);
app.use(`${API}/payroll`, payrollRoutes);
app.use(`${API}/notices`, noticeRoutes);
app.use(`${API}/holidays`, holidayRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[Server Error]", err);

  const statusCode = err.statusCode || 500;
  const message =
    err.message ||
    (statusCode === 500 ? "Internal server error." : "Request failed.");

  res.status(statusCode).json({ message });
});

// Start server
async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`HRMS API running on port ${PORT}`);
      console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
      console.log(`Health: ${API_V1}/health`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
