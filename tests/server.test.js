const request = require('supertest');
const app = require('../src/server');

describe('Task Manager Pro API Tests', () => {
  it('should return health check status successfully from /health', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Task Manager Pro API is running smoothly');
  });

  it('should return health check status successfully from /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Task Manager Pro API is running smoothly');
  });

  it('should return 404 for unknown endpoints', async () => {
    const res = await request(app).get('/api/unknown-endpoint-12345');
    expect(res.statusCode).toEqual(404);
  });
});
