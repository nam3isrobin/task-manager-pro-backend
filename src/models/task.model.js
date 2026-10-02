const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 2000 },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium', index: true },
  status: { type: String, enum: ['Todo', 'To-Do', 'In Progress', 'Completed', 'On Hold'], default: 'Todo', index: true },
  dueDate: { type: Date, index: true },
  tags: [{ type: String, trim: true }],
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subtasks: [{
    id: String,
    title: String,
    completed: { type: Boolean, default: false }
  }],
  comments: [{
    id: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  activityLog: [{
    id: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String,
    timestamp: { type: Date, default: Date.now }
  }],
  attachments: [{
    fileName: String,
    fileUrl: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date }
}, { timestamps: true });

TaskSchema.index({ status: 1, priority: 1, dueDate: 1 });

module.exports = mongoose.model('Task', TaskSchema);
