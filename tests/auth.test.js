const request = require('supertest');
const app = require('../src/server');
const User = require('../src/models/user.model');

jest.mock('../src/models/user.model');

describe('Auth API Tests (Mocked DB)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register a new user successfully', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({
      _id: '60c72b2f9b1d8b2d88f3e45a',
      name: 'Test User',
      email: 'testuser@example.com',
      role: 'user',
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'testuser@example.com',
        password: 'password123',
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.email).toEqual('testuser@example.com');
  });

  it('should login the registered user successfully', async () => {
    const mockUser = {
      _id: '60c72b2f9b1d8b2d88f3e45a',
      name: 'Test User',
      email: 'testuser@example.com',
      role: 'user',
      matchPassword: jest.fn().mockResolvedValue(true),
    };

    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser),
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'password123',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });
});
