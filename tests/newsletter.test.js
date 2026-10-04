const request = require('supertest');
const app = require('../app');

const ENV_KEYS = [
  'BREVO_API_KEY',
  'BREVO_LIST_ID',
  'BREVO_DOI_TEMPLATE_ID',
  'BREVO_DOI_REDIRECT_URL',
];
const savedEnv = {};

/** Makes fetch answer as Brevo's contacts API would. */
const mockBrevo = (status = 201, body = {}) => {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
};

const subscribe = (body) =>
  request(app).post('/api/newsletter/subscribe').send(body);

beforeEach(() => {
  ENV_KEYS.forEach((key) => {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  });
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_LIST_ID = '7';
});

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
  delete global.fetch;
});

describe('POST /api/newsletter/subscribe', () => {
  it('adds the address to the Brevo list', async () => {
    mockBrevo(201);

    const res = await subscribe({ email: '  Maya@Example.com ' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/contacts');
    expect(options.headers['api-key']).toBe('test-key');
    expect(JSON.parse(options.body)).toEqual({
      email: 'maya@example.com',
      listIds: [7],
      updateEnabled: true,
    });
  });

  it('gives an existing subscriber the same answer as a new one', async () => {
    mockBrevo(204); // Brevo: contact already existed, list updated

    const res = await subscribe({ email: 'maya@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/thanks for subscribing/i);
  });

  it('uses double opt-in when a confirmation template is configured', async () => {
    process.env.BREVO_DOI_TEMPLATE_ID = '3';
    process.env.BREVO_DOI_REDIRECT_URL = 'https://sweetnest.test/subscribed';
    mockBrevo(201);

    const res = await subscribe({ email: 'maya@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/confirm/i);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
    expect(JSON.parse(options.body)).toEqual({
      email: 'maya@example.com',
      includeListIds: [7],
      templateId: 3,
      redirectionUrl: 'https://sweetnest.test/subscribed',
    });
  });

  it('rejects an invalid email without contacting Brevo', async () => {
    mockBrevo(201);

    const res = await subscribe({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('quietly ignores bots that fill the honeypot field', async () => {
    mockBrevo(201);

    const res = await subscribe({ email: 'bot@example.com', website: 'http://spam.test' });

    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when Brevo is not configured', async () => {
    delete process.env.BREVO_API_KEY;
    mockBrevo(201);

    const res = await subscribe({ email: 'maya@example.com' });

    expect(res.status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 502 when Brevo rejects the request', async () => {
    mockBrevo(401, { code: 'unauthorized', message: 'Key not found' });

    const res = await subscribe({ email: 'maya@example.com' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it('returns 502 when Brevo cannot be reached', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.brevo.com');
    });

    const res = await subscribe({ email: 'maya@example.com' });

    expect(res.status).toBe(502);
  });
});
