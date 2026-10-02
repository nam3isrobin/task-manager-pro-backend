const Task = require('../models/task.model');

// Helper to populate common task fields
const populateTaskFields = (query) => {
  if (!query || typeof query.populate !== 'function') return query;
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

    const populatedTask = (await populateTaskFields(Task.findById(task._id))) || task;

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
    const userRole = (req.user && req.user.role ? req.user.role : '').toLowerCase();
    const isAdminOrManager = userRole === 'admin' || userRole === 'manager';
    const isCreator = task.creator && task.creator.toString() === req.user._id.toString();
    const isAssignee = task.assignee && task.assignee.toString() === req.user._id.toString();

    if (!isAdminOrManager && !isCreator && !isAssignee) {
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

    const userRole = (req.user && req.user.role ? req.user.role : '').toLowerCase();
    const isAdminOrManager = userRole === 'admin' || userRole === 'manager';
    const isCreator = task.creator && task.creator.toString() === req.user._id.toString();

    if (!isAdminOrManager && !isCreator) {
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

// @desc    Add comment to task
// @route   POST /api/tasks/:id/comments
// @access  Private
const addComment = async (req, res, next) => {
  try {
    const { text } = req.body;

    // Validate comment text
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Comment text is required' });
    }

    const task = await Task.findOne({ _id: req.params.id, isDeleted: false });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const newComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      author: req.user._id,
      text: text.trim(),
      createdAt: new Date(),
    };

    const newActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user: req.user._id,
      action: 'added a comment',
      timestamp: new Date(),
    };

    if (!Array.isArray(task.comments)) {
      task.comments = [];
    }
    task.comments.push(newComment);

    if (!Array.isArray(task.activityLog)) {
      task.activityLog = [];
    }
    task.activityLog.push(newActivity);

    await task.save();

    const populatedTask = (await populateTaskFields(Task.findById(task._id))) || task;

    res.status(201).json({
      success: true,
      data: populatedTask,
      comment: newComment,
      task: populatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add subtask to task
// @route   POST /api/tasks/:id/subtasks
// @access  Private
const addSubtask = async (req, res, next) => {
  try {
    const { title } = req.body;

    // Validate subtask title
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Subtask title is required' });
    }

    const task = await Task.findOne({ _id: req.params.id, isDeleted: false });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const newSubtask = {
      id: `subtask-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      completed: false,
    };

    const newActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user: req.user._id,
      action: `added subtask "${newSubtask.title}"`,
      timestamp: new Date(),
    };

    if (!Array.isArray(task.subtasks)) {
      task.subtasks = [];
    }
    task.subtasks.push(newSubtask);

    if (!Array.isArray(task.activityLog)) {
      task.activityLog = [];
    }
    task.activityLog.push(newActivity);

    await task.save();

    const populatedTask = (await populateTaskFields(Task.findById(task._id))) || task;

    res.status(201).json({
      success: true,
      data: populatedTask,
      subtask: newSubtask,
      task: populatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle subtask completion status
// @route   PATCH /api/tasks/:id/subtasks/:subtaskId/toggle
// @access  Private
const toggleSubtask = async (req, res, next) => {
  try {
    const { id, subtaskId } = req.params;

    const task = await Task.findOne({ _id: id, isDeleted: false });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!Array.isArray(task.subtasks)) {
      task.subtasks = [];
    }

    const subtask = task.subtasks.find(
      (s) => s.id === subtaskId || (s._id && s._id.toString() === subtaskId)
    );

    if (!subtask) {
      return res.status(404).json({ success: false, error: 'Subtask not found' });
    }

    subtask.completed = !subtask.completed;

    const newActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user: req.user._id,
      action: `${subtask.completed ? 'completed' : 'uncompleted'} subtask "${subtask.title}"`,
      timestamp: new Date(),
    };

    if (!Array.isArray(task.activityLog)) {
      task.activityLog = [];
    }
    task.activityLog.push(newActivity);

    await task.save();

    const populatedTask = (await populateTaskFields(Task.findById(task._id))) || task;

    res.status(200).json({
      success: true,
      data: populatedTask,
      subtask,
      task: populatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete subtask from task
// @route   DELETE /api/tasks/:id/subtasks/:subtaskId
// @access  Private
const deleteSubtask = async (req, res, next) => {
  try {
    const { id, subtaskId } = req.params;

    const task = await Task.findOne({ _id: id, isDeleted: false });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!Array.isArray(task.subtasks)) {
      task.subtasks = [];
    }

    const subtaskIndex = task.subtasks.findIndex(
      (s) => s.id === subtaskId || (s._id && s._id.toString() === subtaskId)
    );

    if (subtaskIndex === -1) {
      return res.status(404).json({ success: false, error: 'Subtask not found' });
    }

    const deletedSubtask = task.subtasks[subtaskIndex];
    task.subtasks.splice(subtaskIndex, 1);

    const newActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user: req.user._id,
      action: `deleted subtask "${deletedSubtask.title || subtaskId}"`,
      timestamp: new Date(),
    };

    if (!Array.isArray(task.activityLog)) {
      task.activityLog = [];
    }
    task.activityLog.push(newActivity);

    await task.save();

    const populatedTask = (await populateTaskFields(Task.findById(task._id))) || task;

    res.status(200).json({
      success: true,
      data: populatedTask,
      deletedSubtaskId: subtaskId,
      task: populatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload attachment file to task
// @route   POST /api/tasks/:id/attachments
// @access  Private
const uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please provide a file to upload' });
    }

    const task = await Task.findOne({ _id: req.params.id, isDeleted: false });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const newAttachment = {
      fileName: req.file.originalname,
      filename: req.file.originalname,
      originalName: req.file.originalname,
      fileUrl,
      url: fileUrl,
      uploadedAt: new Date(),
      createdAt: new Date(),
    };

    const newActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user: req.user._id,
      action: `uploaded attachment "${req.file.originalname}"`,
      timestamp: new Date(),
    };

    if (!Array.isArray(task.attachments)) {
      task.attachments = [];
    }
    task.attachments.push(newAttachment);

    if (!Array.isArray(task.activityLog)) {
      task.activityLog = [];
    }
    task.activityLog.push(newActivity);

    await task.save();

    const populatedTask = (await populateTaskFields(Task.findById(task._id))) || task;

    res.status(200).json({
      success: true,
      data: populatedTask,
      attachment: newAttachment,
      task: populatedTask,
    });
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
  addComment,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
  uploadAttachment,
};
