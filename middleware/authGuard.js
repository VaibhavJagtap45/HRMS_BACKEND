const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { parseCookieHeader } = require("../controllers/authController");

const protect = async (req, res, next) => {
  let token = null;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

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
      return res.status(403).json({ message: "Account has been deactivated." });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized. Invalid token." });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Role '${req.user?.role || "unknown"}' is not authorized for this action.`,
    });
  }

  return next();
};

module.exports = { protect, authorize };
