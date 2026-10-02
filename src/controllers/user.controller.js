const User = require('../models/user.model');

// @desc    Get all users (team directory)
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select('_id name email role');
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers };
