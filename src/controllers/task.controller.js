const Task = require('../models/task.model');

// Helper to populate common task fields
const populateTaskFields = (query) => {
  return query
    .populate('assignee', 'name email role avatar')
    .populate('creator', 'name email avatar')
    .populate('comments.author', 'name email role avatar')
    .populate('activityLog.user', 'name email role avatar');
};

// @desc    Get all tasks with filtering, sorting, pagination
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res, next) => {
  try {
    let query;

    // Copy req.query
    const reqQuery = { ...req.query, isDeleted: false };

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
    removeFields.forEach((param) => delete reqQuery[param]);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc.)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);

    // Finding resource
    query = populateTaskFields(Task.find(JSON.parse(queryStr)));

    // Search by title or description
    if (req.query.search) {
      query = query.find({
        $or: [
          { title: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ],
      });
    }

    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Task.countDocuments({ ...JSON.parse(queryStr), isDeleted: false });

    query = query.skip(startIndex).limit(limit);

    // Executing query
    const tasks = await query;

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit,
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit,
      };
    }

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      pagination,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
const getTask = async (req, res, next) => {
  try {
    const task = await populateTaskFields(
      Task.findOne({ _id: req.params.id, isDeleted: false })
    );

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
const createTask = async (req, res, next) => {
  try {
    req.body.creator = req.user._id;

    if (!req.body.activityLog || req.body.activityLog.length === 0) {
      req.body.activityLog = [
        {
          id: `act-${Date.now()}`,
          user: req.user._id,
          action: 'created task',
          timestamp: new Date(),
        },
      ];
    }

    const task = await Task.create(req.body);

    const populatedTask = await populateTaskFields(Task.findById(task._id));

    res.status(201).json({ success: true, data: populatedTask });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res, next) => {
  try {
    let task = await Task.findOne({ _id: req.params.id, isDeleted: false });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Check ownership / permission (Admin/Manager can update any, Creator/Assignee can update status/details)
    if (
      req.user.role !== 'Admin' &&
      req.user.role !== 'Manager' &&
      task.creator.toString() !== req.user._id.toString() &&
      (!task.assignee || task.assignee.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this task' });
    }

    const updates = { ...req.body };
    const newActivityEntries = [];

    // Track status change
    if (updates.status && updates.status !== task.status) {
      newActivityEntries.push({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user: req.user._id,
        action: `updated status to ${updates.status}`,
        timestamp: new Date(),
      });
    }

    // Track priority change
    if (updates.priority && updates.priority !== task.priority) {
      newActivityEntries.push({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user: req.user._id,
        action: `changed priority to ${updates.priority}`,
        timestamp: new Date(),
      });
    }

    // Track reassignment
    if (updates.assignee !== undefined) {
      const prevAssignee = task.assignee ? task.assignee.toString() : null;
      const nextAssignee = updates.assignee ? updates.assignee.toString() : null;
      if (prevAssignee !== nextAssignee) {
        newActivityEntries.push({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          user: req.user._id,
          action: nextAssignee ? 'reassigned task' : 'unassigned task',
          timestamp: new Date(),
        });
      }
    }

    if (newActivityEntries.length > 0) {
      if (!updates.activityLog) {
        updates.activityLog = [...(task.activityLog || []), ...newActivityEntries];
      }
    }

    task = await populateTaskFields(
      Task.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      })
    );

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft delete task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, isDeleted: false });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (
      req.user.role !== 'Admin' &&
      req.user.role !== 'Manager' &&
      task.creator.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this task' });
    }

    task.isDeleted = true;
    task.deletedAt = new Date();
    await task.save();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
};
