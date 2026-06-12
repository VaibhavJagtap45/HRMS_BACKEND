// const express = require("express");
// const createRateLimiter = require("../middleware/rateLimiter");
// const { protect } = require("../middleware/authGuard");
// const authController = require("../controllers/authController");

// const router = express.Router();

// // Brute-force protection on login: 10 attempts per 15 min per IP
// const authRateLimiter = createRateLimiter({ keyPrefix: "auth", max: 10 });

// // POST /api/v1/auth/login — Public
// router.post("/login", authRateLimiter, authController.login); // api :  localhost:3000/api/login

// // POST /api/v1/auth/forgot-password — Public (rate-limited)
// router.post("/forgot-password", authRateLimiter, authController.forgotPassword);

// // POST /api/v1/auth/reset-password — Public (link-based)
// router.post("/reset-password", authController.resetPassword);

// // POST /api/v1/auth/send-otp — Public (rate-limited) — send 6-digit OTP to email
// router.post("/send-otp", authRateLimiter, authController.sendOtp);

// // POST /api/v1/auth/verify-otp — Public — verify OTP, get verifiedToken
// router.post("/verify-otp", authRateLimiter, authController.verifyOtp);

// // POST /api/v1/auth/reset-password-otp — Public — set new password using verifiedToken
// router.post("/reset-password-otp", authController.resetPasswordOtp);

// // POST /api/v1/auth/change-password — Employee / HR (authenticated)
// router.post("/change-password", protect, authController.changePassword);

// // POST /api/v1/auth/logout — Employee / HR (authenticated)
// router.post("/logout", protect, authController.logout);

// // GET /api/v1/auth/me — Get own profile (authenticated)
// router.get("/me", protect, authController.getMe);

// // PUT /api/v1/auth/me — Update own profile photo / phone (authenticated)
// router.put("/me", protect, authController.updateMe);

// module.exports = router;

const express = require("express");
const { protect } = require("../middleware/authGuard");
const authController = require("../controllers/authController");

const router = express.Router();

// Rate limiting intentionally removed — auth endpoints are unthrottled so users
// can log in, request OTPs, and reset/change their password as many times as
// they need without ever hitting a "Too many requests" error.
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/reset-password-otp", authController.resetPasswordOtp);

// Diagnostic (no secrets): GET /auth/mailer-status -> { configured, provider }
router.get("/mailer-status", authController.mailerStatus);

router.post("/change-password", protect, authController.changePassword);
router.post("/logout", protect, authController.logout);
router.get("/me", protect, authController.getMe);
router.put("/me", protect, authController.updateMe);

module.exports = router;
