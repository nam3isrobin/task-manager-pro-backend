const User = require('../models/user.model');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Please provide an email address' });
    }
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User with this email not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set expire (10 minutes)
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Password reset token generated successfully',
      resetToken, // for testing / development
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resettoken OR POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const resetToken = req.params.resettoken || req.body.token || req.body.resetToken;
    const { newPassword, password, email } = req.body;
    const pwd = newPassword || password;

    if (!pwd) {
      return res.status(400).json({ success: false, error: 'Please provide a new password' });
    }

    let user;

    if (resetToken) {
      const hashedToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpire: { $gt: Date.now() },
      });
    } else if (email) {
      user = await User.findOne({ email });
    }

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    user.password = pwd;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { forgotPassword, resetPassword };
