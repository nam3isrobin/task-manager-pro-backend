const express = require('express');
const {
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
} = require('../controllers/task.controller');
const { protect } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

const router = express.Router();

// Enforce authentication across all task routes
router.use(protect);

// Base task routes: list all, create new
router.route('/').get(getTasks).post(createTask);

// Single task routes: retrieve, update, soft delete
router.route('/:id').get(getTask).put(updateTask).delete(deleteTask);

// Comments: add comment to task
router.route('/:id/comments').post(addComment);

// Subtasks: create new subtask
router.route('/:id/subtasks').post(addSubtask);

// Subtasks: toggle completion status
router.route('/:id/subtasks/:subtaskId/toggle').patch(toggleSubtask);

// Subtasks: remove subtask
router.route('/:id/subtasks/:subtaskId').delete(deleteSubtask);

// Attachments: upload single file attachment (max 10MB)
router.route('/:id/attachments').post(upload.single('file'), uploadAttachment);

module.exports = router;
