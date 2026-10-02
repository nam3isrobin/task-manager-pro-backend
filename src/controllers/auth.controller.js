const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

/**
 * Generate signed JWT token
 * @param {string} id - User ID
 * @returns {string} Signed JWT token string
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

// @desc    Register a new user (Direct access without OTP verification)
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide name, email, and password' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const userExists = await User.findOne({ email: trimmedEmail });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'A user with this email address already exists' });
    }

    // Direct account creation with verified status and approved access
    const user = await User.create({
      name: name.trim(),
      email: trimmedEmail,
      password,
      role: 'user',
      isVerified: true,
      approvalStatus: 'approved',
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      requiresVerification: false,
      message: 'Registration successful! Welcome to Task Manager Pro.',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: true,
        approvalStatus: 'approved',
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Email OTP code (Compatibility stub - verification disabled)
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOtp = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'OTP verification is disabled.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend Email OTP code (Compatibility stub - verification disabled)
// @route   POST /api/auth/resend-otp
// @access  Public
const resendOtp = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'OTP verification is disabled.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide email and password' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: trimmedEmail }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Check if account registration was declined by the administrator
    if (user.role !== 'admin' && user.approvalStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        isRejected: true,
        error: `Your account registration was declined by the administrator.${user.rejectionReason ? ` Reason: "${user.rejectionReason}"` : ''}`,
        rejectionReason: user.rejectionReason,
      });
    }

    // Check if account is explicitly pending approval
    if (user.role !== 'admin' && user.approvalStatus === 'pending') {
      return res.status(403).json({
        success: false,
        isPendingApproval: true,
        error: 'Your account is awaiting Administrator approval.',
        email: user.email,
      });
    }

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified !== undefined ? user.isVerified : true,
        approvalStatus: user.approvalStatus || 'approved',
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, verifyOtp, resendOtp, login, getMe };
