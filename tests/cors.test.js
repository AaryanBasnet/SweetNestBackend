const request = require('supertest');
const app = require('../app');
const { captureError } = require('../config/sentry');

jest.mock('../config/sentry', () => ({
  captureError: jest.fn(),
  initSentry: jest.fn(),
}));

describe('CORS', () => {
  afterEach(() => jest.clearAllMocks());

  it('allows a listed origin', async () => {
    const res = await request(app)
      .get('/api/cakes')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('refuses an unlisted origin with a 403, not a server error', async () => {
    const res = await request(app)
      .get('/api/cakes')
      .set('Origin', 'https://some-copy-of-the-site.vercel.app');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not allowed by CORS/);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not report a refused origin to error tracking', async () => {
    await request(app)
      .get('/api/cakes')
      .set('Origin', 'https://some-copy-of-the-site.vercel.app');

    expect(captureError).not.toHaveBeenCalled();
  });

  it('lets requests without an Origin header through (curl, server-to-server)', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });
});
