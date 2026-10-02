const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const app = require('../src/server');
const Task = require('../src/models/task.model');
const User = require('../src/models/user.model');

// Mock Mongoose models
jest.mock('../src/models/task.model');
jest.mock('../src/models/user.model');

// Helper to create chained thenable query mocks for Mongoose find/populate
const createMockQuery = (resolvedValue) => {
  const query = {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    find: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(resolvedValue).then(resolve, reject),
  };
  return query;
};

describe('Task Management API Tests (Mocked DB)', () => {
  const mockUserId = '60c72b2f9b1d8b2d88f3e45a';
  const mockAdminUser = {
    _id: mockUserId,
    name: 'Lead Developer',
    email: 'dev@taskmanagerpro.io',
    role: 'admin',
    approvalStatus: 'approved',
  };

  const validToken = jwt.sign(
    { id: mockUserId },
    process.env.JWT_SECRET || 'fallback_secret'
  );

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for User authentication lookup in protect middleware
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockAdminUser),
    });
  });

  // ---------------------------------------------------------
  // 1. Authentication & Security Middleware
  // ---------------------------------------------------------
  describe('Authentication Guards', () => {
    it('should return 401 when no authorization token is provided', async () => {
      const res = await request(app).get('/api/tasks');
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/no token/i);
    });

    it('should return 401 when an invalid authorization token is provided', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', 'Bearer invalid.jwt.token');
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/token failed/i);
    });
  });

  // ---------------------------------------------------------
  // 2. Task Retrieval & Listing
  // ---------------------------------------------------------
  describe('GET /api/tasks & GET /api/tasks/:id', () => {
    it('should retrieve task list with pagination and totals', async () => {
      const sampleTasks = [
        {
          _id: '60c72b2f9b1d8b2d88f3e45b',
          title: 'Design Database Schema',
          status: 'Todo',
          priority: 'High',
          creator: mockUserId,
        },
      ];

      Task.find.mockReturnValue(createMockQuery(sampleTasks));
      Task.countDocuments.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toEqual(1);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data[0].title).toEqual('Design Database Schema');
    });

    it('should retrieve a single task by ID', async () => {
      const sampleTask = {
        _id: '60c72b2f9b1d8b2d88f3e45b',
        title: 'Refactor Auth Pipeline',
        status: 'In Progress',
        creator: mockUserId,
      };

      Task.findOne.mockReturnValue(createMockQuery(sampleTask));

      const res = await request(app)
        .get('/api/tasks/60c72b2f9b1d8b2d88f3e45b')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toEqual('Refactor Auth Pipeline');
    });

    it('should return 404 when task is not found', async () => {
      Task.findOne.mockReturnValue(createMockQuery(null));

      const res = await request(app)
        .get('/api/tasks/nonexistent-task-id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Task not found');
    });
  });

  // ---------------------------------------------------------
  // 3. Task Creation & Updates
  // ---------------------------------------------------------
  describe('POST /api/tasks & PUT /api/tasks/:id', () => {
    it('should create a new task with initial activity log', async () => {
      const newTaskData = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        title: 'Configure Rate Limiting',
        description: 'Set express-rate-limit bounds on public routes',
        priority: 'Urgent',
        status: 'Todo',
        creator: mockUserId,
        activityLog: [
          {
            id: 'act-1',
            user: mockUserId,
            action: 'created task',
          },
        ],
      };

      Task.create.mockResolvedValue(newTaskData);
      Task.findById.mockReturnValue(createMockQuery(newTaskData));

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          title: 'Configure Rate Limiting',
          description: 'Set express-rate-limit bounds on public routes',
          priority: 'Urgent',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toEqual('Configure Rate Limiting');
    });

    it('should update an existing task and record activity', async () => {
      const existingTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        title: 'Configure Rate Limiting',
        status: 'Todo',
        priority: 'Urgent',
        creator: mockUserId,
        activityLog: [],
      };

      const updatedTask = {
        ...existingTask,
        status: 'Completed',
      };

      Task.findOne.mockResolvedValue(existingTask);
      Task.findByIdAndUpdate.mockReturnValue(createMockQuery(updatedTask));

      const res = await request(app)
        .put('/api/tasks/60c72b2f9b1d8b2d88f3e45c')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          status: 'Completed',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toEqual('Completed');
    });
  });

  // ---------------------------------------------------------
  // 4. Comments Feature
  // ---------------------------------------------------------
  describe('POST /api/tasks/:id/comments', () => {
    it('should successfully append a comment and activity entry', async () => {
      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        title: 'Review PR #42',
        comments: [],
        activityLog: [],
        save: jest.fn().mockResolvedValue(true),
      };

      Task.findOne.mockResolvedValue(mockTask);
      Task.findById.mockReturnValue(createMockQuery(mockTask));

      const res = await request(app)
        .post('/api/tasks/60c72b2f9b1d8b2d88f3e45c/comments')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ text: 'All unit test specs passed successfully!' });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(mockTask.comments.length).toEqual(1);
      expect(mockTask.comments[0].text).toEqual('All unit test specs passed successfully!');
      expect(mockTask.comments[0].author).toEqual(mockUserId);
      expect(mockTask.activityLog.length).toEqual(1);
      expect(mockTask.activityLog[0].action).toEqual('added a comment');
      expect(mockTask.save).toHaveBeenCalled();
    });

    it('should return 400 when comment text is missing or blank', async () => {
      const res = await request(app)
        .post('/api/tasks/60c72b2f9b1d8b2d88f3e45c/comments')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ text: '   ' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Comment text is required');
    });

    it('should return 404 when adding comment to non-existent task', async () => {
      Task.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/tasks/unknown-task/comments')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ text: 'Valid text' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Task not found');
    });
  });

  // ---------------------------------------------------------
  // 5. Subtasks Feature (Add, Toggle, Delete)
  // ---------------------------------------------------------
  describe('Subtask Management API', () => {
    it('should append a new subtask with completed=false and log activity', async () => {
      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        title: 'Deploy to Cloud',
        subtasks: [],
        activityLog: [],
        save: jest.fn().mockResolvedValue(true),
      };

      Task.findOne.mockResolvedValue(mockTask);
      Task.findById.mockReturnValue(createMockQuery(mockTask));

      const res = await request(app)
        .post('/api/tasks/60c72b2f9b1d8b2d88f3e45c/subtasks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ title: 'Verify SSL Certificates' });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(mockTask.subtasks.length).toEqual(1);
      expect(mockTask.subtasks[0].title).toEqual('Verify SSL Certificates');
      expect(mockTask.subtasks[0].completed).toBe(false);
      expect(mockTask.activityLog[0].action).toContain('Verify SSL Certificates');
      expect(mockTask.save).toHaveBeenCalled();
    });

    it('should return 400 when subtask title is empty', async () => {
      const res = await request(app)
        .post('/api/tasks/60c72b2f9b1d8b2d88f3e45c/subtasks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ title: '' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Subtask title is required');
    });

    it('should toggle subtask completion flag and log activity', async () => {
      const subtaskItem = {
        id: 'subtask-123',
        title: 'Run Smoke Tests',
        completed: false,
      };

      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        subtasks: [subtaskItem],
        activityLog: [],
        save: jest.fn().mockResolvedValue(true),
      };

      Task.findOne.mockResolvedValue(mockTask);
      Task.findById.mockReturnValue(createMockQuery(mockTask));

      const res = await request(app)
        .patch('/api/tasks/60c72b2f9b1d8b2d88f3e45c/subtasks/subtask-123/toggle')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(subtaskItem.completed).toBe(true);
      expect(mockTask.activityLog[0].action).toContain('completed subtask "Run Smoke Tests"');
      expect(mockTask.save).toHaveBeenCalled();
    });

    it('should delete a subtask from the list and log activity', async () => {
      const subtaskItem = {
        id: 'subtask-456',
        title: 'Legacy Deprecated Step',
        completed: false,
      };

      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        subtasks: [subtaskItem],
        activityLog: [],
        save: jest.fn().mockResolvedValue(true),
      };

      Task.findOne.mockResolvedValue(mockTask);
      Task.findById.mockReturnValue(createMockQuery(mockTask));

      const res = await request(app)
        .delete('/api/tasks/60c72b2f9b1d8b2d88f3e45c/subtasks/subtask-456')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(mockTask.subtasks.length).toEqual(0);
      expect(mockTask.activityLog[0].action).toContain('deleted subtask');
      expect(mockTask.save).toHaveBeenCalled();
    });

    it('should return 404 when toggling a non-existent subtask', async () => {
      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        subtasks: [],
      };

      Task.findOne.mockResolvedValue(mockTask);

      const res = await request(app)
        .patch('/api/tasks/60c72b2f9b1d8b2d88f3e45c/subtasks/missing-subtask/toggle')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toEqual('Subtask not found');
    });
  });

  // ---------------------------------------------------------
  // 6. Attachments Upload Feature
  // ---------------------------------------------------------
  describe('POST /api/tasks/:id/attachments', () => {
    it('should upload a file attachment, store url, and log activity', async () => {
      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        attachments: [],
        activityLog: [],
        save: jest.fn().mockResolvedValue(true),
      };

      Task.findOne.mockResolvedValue(mockTask);
      Task.findById.mockReturnValue(createMockQuery(mockTask));

      const res = await request(app)
        .post('/api/tasks/60c72b2f9b1d8b2d88f3e45c/attachments')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', Buffer.from('PDF Mock Document Content'), 'architecture.pdf');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(mockTask.attachments.length).toEqual(1);
      expect(mockTask.attachments[0].fileName).toEqual('architecture.pdf');
      expect(mockTask.attachments[0].fileUrl).toMatch(/^\/uploads\//);
      expect(mockTask.activityLog[0].action).toContain('architecture.pdf');
      expect(mockTask.save).toHaveBeenCalled();

      // Clean up uploaded test artifact if written to disk
      const uploadedFilename = mockTask.attachments[0].fileUrl.replace('/uploads/', '');
      const localFilePath = path.join(__dirname, '../uploads', uploadedFilename);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    });

    it('should return 400 when no attachment file is attached in request', async () => {
      const res = await request(app)
        .post('/api/tasks/60c72b2f9b1d8b2d88f3e45c/attachments')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Please provide a file to upload');
    });

    it('should return 404 when uploading attachment to non-existent task', async () => {
      Task.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/tasks/missing-task-id/attachments')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', Buffer.from('Mock content'), 'test.txt');

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Task not found');
    });
  });

  // ---------------------------------------------------------
  // 7. Soft Delete Task
  // ---------------------------------------------------------
  describe('DELETE /api/tasks/:id', () => {
    it('should soft delete task by setting isDeleted to true', async () => {
      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        creator: mockUserId,
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      Task.findOne.mockResolvedValue(mockTask);

      const res = await request(app)
        .delete('/api/tasks/60c72b2f9b1d8b2d88f3e45c')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(mockTask.isDeleted).toBe(true);
      expect(mockTask.deletedAt).toBeDefined();
      expect(mockTask.save).toHaveBeenCalled();
    });

    it('should return 403 when non-creator, non-admin user attempts delete', async () => {
      const mockNonPrivilegedUser = {
        _id: 'non-owner-id',
        name: 'Guest User',
        email: 'guest@example.com',
        role: 'user',
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockNonPrivilegedUser),
      });

      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        creator: 'different-creator-id',
        isDeleted: false,
      };

      Task.findOne.mockResolvedValue(mockTask);

      const res = await request(app)
        .delete('/api/tasks/60c72b2f9b1d8b2d88f3e45c')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not authorized/i);
    });
  });

  // ---------------------------------------------------------
  // 8. Advanced Filters, Queries, & Security Guards
  // ---------------------------------------------------------
  describe('Advanced Filters and Security Guards', () => {
    it('should handle search, select, and sort query parameters', async () => {
      const sampleTasks = [
        { _id: '1', title: 'Special Task', status: 'Todo' },
      ];

      Task.find.mockReturnValue(createMockQuery(sampleTasks));
      Task.countDocuments.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/tasks?search=Special&sort=createdAt&select=title,status&page=1&limit=5')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toEqual(1);
    });

    it('should return 403 when unauthorized user attempts PUT update', async () => {
      const mockNonPrivilegedUser = {
        _id: 'non-owner-id',
        name: 'Guest User',
        email: 'guest@example.com',
        role: 'user',
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockNonPrivilegedUser),
      });

      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        creator: 'different-creator-id',
        assignee: 'another-user-id',
        isDeleted: false,
      };

      Task.findOne.mockResolvedValue(mockTask);

      const res = await request(app)
        .put('/api/tasks/60c72b2f9b1d8b2d88f3e45c')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'Completed' });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not authorized/i);
    });

    it('should return 404 when deleting a subtask on a non-existent task', async () => {
      Task.findOne.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/tasks/non-existent-task/subtasks/subtask-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toEqual('Task not found');
    });

    it('should return 404 when deleting a non-existent subtask ID on an existing task', async () => {
      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        subtasks: [{ id: 'other-subtask', title: 'Task A' }],
      };

      Task.findOne.mockResolvedValue(mockTask);

      const res = await request(app)
        .delete('/api/tasks/60c72b2f9b1d8b2d88f3e45c/subtasks/missing-subtask')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toEqual('Subtask not found');
    });

    it('should reject dangerous executable file uploads with 500 error from middleware', async () => {
      const mockTask = {
        _id: '60c72b2f9b1d8b2d88f3e45c',
        attachments: [],
        activityLog: [],
      };

      Task.findOne.mockResolvedValue(mockTask);

      const res = await request(app)
        .post('/api/tasks/60c72b2f9b1d8b2d88f3e45c/attachments')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', Buffer.from('malicious payload'), 'exploit.exe');

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);
    });
  });
});
