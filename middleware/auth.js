/**
 * auth.js — JWT authentication & role-based authorisation middleware.
 *
 * Accepts tokens from two sources (in priority order):
 *   1. Authorization: Bearer <token>  header
 *   2. hrms_token HTTP-only cookie
 *
 * Usage:
 *   router.use(protect)                  — require any authenticated user
 *   router.get("/", authorize("hr"), ...) — restrict to specific role(s)
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { parseCookieHeader } = require("../controllers/authController");

/**
 * Verify JWT and attach req.user.
 * Returns 401 if no token, 401 if invalid/expired, 403 if account deactivated.
 */
const protect = async (req, res, next) => {
  let token = null;

  // 1. Check Authorization header
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  // 2. Fall back to HTTP-only cookie
  if (!token && req.headers.cookie) {
    const cookies = parseCookieHeader(req.headers.cookie);
    token = cookies.hrms_token || null;
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ message: "User no longer exists." });
    }
    if (!req.user.isActive) {
      return res.status(403).json({ message: "Account has been deactivated. Contact HR." });
    }

    return next();
  } catch {
    return res.status(401).json({ message: "Not authorized. Invalid or expired token." });
  }
};

/**
 * Restrict access to one or more roles.
 * Must be used AFTER protect so req.user is populated.
 *
 * @param {...string} roles — e.g. authorize("hr") or authorize("hr", "employee")
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Role '${req.user?.role ?? "unknown"}' is not authorized for this action.`,
    });
  }
  return next();
};

module.exports = { protect, authorize };
