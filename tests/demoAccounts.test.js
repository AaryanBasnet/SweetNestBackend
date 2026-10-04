const request = require('supertest');
const app = require('../app');
const User = require('../model/User');
const Order = require('../model/Order');
const seedDemoAccounts = require('../utils/seedDemoAccounts');
const { DEMO_ACCOUNTS } = require('../config/demoAccounts');
const {
  createUser,
  createCategory,
  createCake,
  createOrder,
} = require('./helpers/factories');
const { __getSentEmails, __clearSentEmails } = require('./mocks/email');

const demoLogin = (role) => request(app).post('/api/users/demo-login').send({ role });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let savedFlag;

beforeEach(async () => {
  savedFlag = process.env.DEMO_ACCOUNTS_ENABLED;
  process.env.DEMO_ACCOUNTS_ENABLED = 'true';
  __clearSentEmails();
  await seedDemoAccounts();
});

afterEach(async () => {
  if (savedFlag === undefined) delete process.env.DEMO_ACCOUNTS_ENABLED;
  else process.env.DEMO_ACCOUNTS_ENABLED = savedFlag;
  await User.deleteMany({});
  await Order.deleteMany({});
});

describe('demo account seeding', () => {
  it('creates one demo customer and one demo admin, and is safe to re-run', async () => {
    await seedDemoAccounts();

    const demos = await User.find({ isDemo: true }).sort({ role: 1 });
    expect(demos.map((u) => [u.email, u.role])).toEqual([
      [DEMO_ACCOUNTS.admin.email, 'admin'],
      [DEMO_ACCOUNTS.customer.email, 'user'],
    ]);
  });

  it('does nothing when demo mode is off', async () => {
    await User.deleteMany({});
    process.env.DEMO_ACCOUNTS_ENABLED = 'false';

    await seedDemoAccounts();

    expect(await User.countDocuments({ isDemo: true })).toBe(0);
  });
});

describe('POST /api/users/demo-login', () => {
  it('signs in to the demo customer without a password', async () => {
    const res = await demoLogin('customer');

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.userData).toMatchObject({
      email: DEMO_ACCOUNTS.customer.email,
      role: 'user',
      isDemo: true,
    });
  });

  it('signs in to the demo admin', async () => {
    const res = await demoLogin('admin');

    expect(res.status).toBe(200);
    expect(res.body.userData).toMatchObject({ role: 'admin', isDemo: true });
  });

  it('rejects any other role', async () => {
    const res = await demoLogin('superuser');

    expect(res.status).toBe(400);
  });

  it('does not exist when demo mode is off', async () => {
    process.env.DEMO_ACCOUNTS_ENABLED = 'false';

    const res = await demoLogin('admin');

    expect(res.status).toBe(404);
  });

  it('cannot be used to sign in as a real admin', async () => {
    // A real admin who happens to have the demo address is not a demo account
    await User.deleteMany({ email: DEMO_ACCOUNTS.admin.email });
    await createUser({ email: DEMO_ACCOUNTS.admin.email, role: 'admin' });

    const res = await demoLogin('admin');

    expect(res.status).toBe(404);
  });
});

describe('demo admin is read-only', () => {
  let token;

  beforeEach(async () => {
    token = (await demoLogin('admin')).body.token;
  });

  it('can read admin screens', async () => {
    const res = await request(app).get('/api/users/customers').set(auth(token));

    expect(res.status).toBe(200);
  });

  it('cannot change anything through admin routes', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set(auth(token))
      .send({ name: 'Demo Category' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/read-only demo/i);
  });

  it("cannot cancel another customer's order", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app)
      .put(`/api/orders/${order._id}/cancel`)
      .set(auth(token))
      .send({ reason: 'Trying it from the demo admin' });

    expect(res.status).toBe(403);
    expect((await Order.findById(order._id)).orderStatus).toBe(order.orderStatus);
  });
});

describe('demo customer limits', () => {
  let token;

  beforeEach(async () => {
    token = (await demoLogin('customer')).body.token;
  });

  it('cannot edit the profile', async () => {
    const res = await request(app)
      .put('/api/users/profile')
      .set(auth(token))
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
    const demo = await User.findOne({ email: DEMO_ACCOUNTS.customer.email });
    expect(demo.name).toBe(DEMO_ACCOUNTS.customer.name);
  });

  it('cannot post a public review', async () => {
    const category = await createCategory();
    const cake = await createCake({ category: category._id });

    const res = await request(app)
      .post(`/api/cakes/${cake._id}/reviews`)
      .set(auth(token))
      .send({ rating: 1, comment: 'Posted from the shared demo account' });

    expect(res.status).toBe(403);
  });

  it('never gets a password reset code', async () => {
    const res = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: DEMO_ACCOUNTS.customer.email });

    // Same answer as any other address, but nothing is sent
    expect(res.status).toBe(200);
    expect(__getSentEmails()).toHaveLength(0);
  });

  it('still behaves as a normal signed-in customer for reading', async () => {
    const res = await request(app).get('/api/users/profile').set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.userData.isDemo).toBe(true);
  });
});
