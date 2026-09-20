const request = require('supertest');
const app = require('../app');

describe('health endpoints', () => {
  it('GET /health reports the process is alive', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /ready reports the database is reachable', async () => {
    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });

  it('unknown routes fall through to the 404 handler', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');

    expect(res.status).toBe(404);
  });
});
