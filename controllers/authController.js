const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { DEFAULT_JWT_EXPIRES_IN } = require("../utils/constants");
const { sendPasswordResetEmail, sendOtpEmail } = require("../utils/mailer");

function parseCookieHeader(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, pair) => {
    const [rawKey, ...rest] = pair.split("=");
    const key = rawKey?.trim();
    if (!key) {
      return cookies;
    }
    cookies[key] = decodeURIComponent(rest.join("=") || "");
    return cookies;
  }, {});
}

function generateToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
  });
}

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000,
  };
}

function sendAuthPayload(res, user, statusCode = 200) {
  const token = generateToken(user._id);
  res.cookie("hrms_token", token, buildCookieOptions());

  return res.status(statusCode).json({
    token,
    user: user.toJSON ? user.toJSON() : user,
  });
}

async function login(req, res) {
  try {
    const { email, employeeId, password } = req.body;
    const identifier = (email || employeeId || "").trim();

    if (!identifier || !password) {
      return res.status(400).json({ message: "Please provide email or employee ID, and password." });
    }

    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { employeeId: identifier.toUpperCase() },
      ],
    }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account has been deactivated. Please contact HR." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    return sendAuthPayload(res, user);
  } catch (error) {
    return res.status(500).json({ message: "Server error during login.", error: error.message });
  }
}

async function getMe(req, res) {
  try {
    const user = await User.findById(req.user._id);
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function updateMe(req, res) {
  try {
    const { name, phone, profilePic, avatar, password, bankName, bankAccountNo, ifscCode, branchName } = req.body;
    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (name !== undefined) {
      user.name = name.trim();
    }
    if (phone !== undefined) {
      user.phone = phone.trim();
    }
    if (profilePic !== undefined) {
      user.profilePic = profilePic;
      user.avatar = profilePic;
    }
    if (avatar !== undefined) {
      user.avatar = avatar;
      user.profilePic = avatar;
    }
    if (password) {
      user.password = password;
      user.mustChangePassword = false;
    }
    if (bankName !== undefined) {
      user.bankName = bankName.trim();
    }
    if (bankAccountNo !== undefined) {
      user.bankAccountNo = bankAccountNo.trim();
    }
    if (ifscCode !== undefined) {
      user.ifscCode = ifscCode.trim().toUpperCase();
    }
    if (branchName !== undefined) {
      user.branchName = branchName.trim();
    }

    await user.save();
    return res.json({ user, message: "Profile updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    user.tempPassword = '';   // self-change: HR-set temp is now stale
    await user.save();

    return sendAuthPayload(res, user);
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

async function logout(req, res) {
  res.clearCookie("hrms_token", buildCookieOptions());
  return res.json({ message: "Logged out successfully." });
}

/**
 * POST /api/v1/auth/forgot-password
 * Public — accepts email or employeeId, generates a reset token,
 * emails the link (or returns it in dev mode when SMTP is not configured).
 */
async function forgotPassword(req, res) {
  try {
    const { identifier } = req.body;
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ message: "Please provide your email or employee ID." });
    }

    const id = identifier.trim();
    const user = await User.findOne({
      $or: [
        { email: id.toLowerCase() },
        { employeeId: id.toUpperCase() },
      ],
    });

    // Always respond with success to prevent user enumeration
    const safeResponse = {
      message: "If that account exists, a password reset link has been sent.",
    };

    if (!user || !user.isActive) {
      return res.json(safeResponse);
    }

    // Generate a cryptographically random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const resetUrl = `${clientUrl}/reset-password?token=${rawToken}`;

    const emailSent = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
    });

    if (!emailSent) {
      // SMTP not configured — return token in response for dev/testing
      return res.json({
        ...safeResponse,
        _dev_resetUrl: resetUrl,
        _dev_note: "SMTP not configured. Use this URL to reset the password (dev only).",
      });
    }

    return res.json(safeResponse);
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

/**
 * POST /api/v1/auth/reset-password
 * Public — validates the token and sets the new password.
 * Body: { token, password }
 */
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required." });
    }
    if (String(password).trim().length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select("+passwordResetToken +passwordResetExpires +password");

    if (!user) {
      return res.status(400).json({ message: "Reset link is invalid or has expired. Please request a new one." });
    }

    user.password = String(password).trim();
    user.mustChangePassword = false;
    user.tempPassword = "";            // clear any HR-set temp password
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    return res.json({ message: "Password reset successfully. You can now sign in with your new password." });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
}

/**
 * POST /api/v1/auth/send-otp
 * Public — generates a 6-digit OTP and emails it.
 * Body: { identifier }   (email or employeeId)
 */
async function sendOtp(req, res) {
  try {
    const { identifier } = req.body;
    if (!identifier?.trim()) {
      return res.status(400).json({ message: "Please provide your email or employee ID." });
    }

    const id = identifier.trim();
    const user = await User.findOne({
      $or: [
        { email: id.toLowerCase() },
        { employeeId: id.toUpperCase() },
      ],
    }).select("+passwordResetOtp +passwordResetOtpExpires");

    // Always return success to prevent user enumeration
    const safeRes = { message: "If that account exists, an OTP has been sent to the registered email." };
    if (!user || !user.isActive) return res.json(safeRes);

    // Rate-limit: block if a fresh OTP (< 1 min old) already exists
    if (
      user.passwordResetOtpExpires &&
      user.passwordResetOtpExpires > new Date(Date.now() + 9 * 60 * 1000)
    ) {
      return res.status(429).json({ message: "An OTP was already sent recently. Please wait a moment before requesting a new one." });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    user.passwordResetOtp = hashedOtp;
    user.passwordResetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    user.passwordResetVerifiedToken = null;
    user.passwordResetVerifiedExpires = null;
    await user.save({ validateBeforeSave: false });

    const sent = await sendOtpEmail({ to: user.email, name: user.name, otp });

    if (!sent) {
      // SMTP not configured — return OTP in dev mode
      return res.json({ ...safeRes, _dev_otp: otp, _dev_note: "SMTP not configured. OTP returned for dev only." });
    }

    return res.json(safeRes);
  } catch (err) {
    console.error("sendOtp error:", err);
    return res.status(500).json({ message: "Server error." });
  }
}

/**
 * POST /api/v1/auth/verify-otp
 * Public — validates the OTP, returns a short-lived verified token.
 * Body: { identifier, otp }
 */
async function verifyOtp(req, res) {
  try {
    const { identifier, otp } = req.body;
    if (!identifier?.trim() || !otp?.trim()) {
      return res.status(400).json({ message: "Identifier and OTP are required." });
    }

    const id = identifier.trim();
    const user = await User.findOne({
      $or: [
        { email: id.toLowerCase() },
        { employeeId: id.toUpperCase() },
      ],
    }).select("+passwordResetOtp +passwordResetOtpExpires +passwordResetVerifiedToken +passwordResetVerifiedExpires");

    if (!user || !user.isActive) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    if (!user.passwordResetOtp || !user.passwordResetOtpExpires || user.passwordResetOtpExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp.trim()).digest("hex");
    if (hashedOtp !== user.passwordResetOtp) {
      return res.status(400).json({ message: "Incorrect OTP. Please check and try again." });
    }

    // OTP correct — issue a 15-min verified token to allow the reset call
    const rawVerifiedToken = crypto.randomBytes(32).toString("hex");
    const hashedVerifiedToken = crypto.createHash("sha256").update(rawVerifiedToken).digest("hex");

    user.passwordResetOtp = null;
    user.passwordResetOtpExpires = null;
    user.passwordResetVerifiedToken = hashedVerifiedToken;
    user.passwordResetVerifiedExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    return res.json({ message: "OTP verified.", verifiedToken: rawVerifiedToken });
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res.status(500).json({ message: "Server error." });
  }
}

/**
 * POST /api/v1/auth/reset-password-otp
 * Public — sets a new password using the verified token from verifyOtp.
 * Body: { verifiedToken, password }
 */
async function resetPasswordOtp(req, res) {
  try {
    const { verifiedToken, password } = req.body;
    if (!verifiedToken || !password) {
      return res.status(400).json({ message: "Verified token and new password are required." });
    }
    if (String(password).trim().length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const hashedToken = crypto.createHash("sha256").update(verifiedToken).digest("hex");

    const user = await User.findOne({
      passwordResetVerifiedToken: hashedToken,
      passwordResetVerifiedExpires: { $gt: new Date() },
    }).select("+passwordResetVerifiedToken +passwordResetVerifiedExpires +password");

    if (!user) {
      return res.status(400).json({ message: "Session expired. Please start over." });
    }

    user.password = String(password).trim();
    user.mustChangePassword = false;
    user.tempPassword = "";
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.passwordResetVerifiedToken = null;
    user.passwordResetVerifiedExpires = null;
    await user.save();

    return res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    console.error("resetPasswordOtp error:", err);
    return res.status(500).json({ message: "Server error." });
  }
}

module.exports = {
  parseCookieHeader,
  generateToken,
  login,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  sendOtp,
  verifyOtp,
  resetPasswordOtp,
  logout,
};
