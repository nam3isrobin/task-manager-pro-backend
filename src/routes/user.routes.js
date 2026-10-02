const express = require('express');
const User = require('../models/user.model');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendApprovalDecisionEmail } = require('../services/email.service');

const router = express.Router();

router.use(protect);

// @desc    Get all active team members (assignee selector)
// @route   GET /api/users
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const users = await User.find({ approvalStatus: 'approved' }).select('_id name email role avatar department');
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get all registered users & pending approval requests (Admin only)
// @route   GET /api/users/admin/all
// @access  Private (Admin only)
router.get('/admin/all', authorize('admin'), async (req, res, next) => {
  try {
    const users = await User.find({}).select('_id name email role isVerified approvalStatus rejectionReason department createdAt');
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Approve a pending user registration (Admin only)
// @route   PATCH /api/users/admin/:id/approve
// @access  Private (Admin only)
router.patch('/admin/:id/approve', authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    user.approvalStatus = 'approved';
    user.rejectionReason = '';
    await user.save({ validateBeforeSave: false });

    // Send congratulatory approval email via SMTP
    await sendApprovalDecisionEmail({
      to: user.email,
      name: user.name,
      status: 'approved',
    });

    res.status(200).json({
      success: true,
      message: `User ${user.email} has been approved and granted workspace access.`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Reject / Decline a user registration (Admin only)
// @route   PATCH /api/users/admin/:id/reject
// @access  Private (Admin only)
router.patch('/admin/:id/reject', authorize('admin'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Cannot reject the Root Administrator account' });
    }

    user.approvalStatus = 'rejected';
    user.rejectionReason = reason || 'Access denied by system administrator';
    await user.save({ validateBeforeSave: false });

    // Send rejection email via SMTP
    await sendApprovalDecisionEmail({
      to: user.email,
      name: user.name,
      status: 'rejected',
      reason: user.rejectionReason,
    });

    res.status(200).json({
      success: true,
      message: `User ${user.email} access was declined.`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
