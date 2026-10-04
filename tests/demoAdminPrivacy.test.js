/**
 * The public demo admin must never see a real customer.
 *
 * Anyone can sign in as the demo admin, so read-only is not enough: every
 * admin read has to leave real customers' names, emails, orders, reviews and
 * messages out (services/demoScope.js). The sweep test below calls every admin
 * read endpoint and fails if a real customer's details appear anywhere.
 */

const request = require('supertest');
const app = require('../app');
const User = require('../model/User');
const Order = require('../model/Order');
const Review = require('../model/Review');
const Contact = require('../model/Contact');
const seedDemoAccounts = require('../utils/seedDemoAccounts');
const {
  createUser,
  createAdmin,
  createCategory,
  createCake,
  createOrder,
  createReview,
  auth,
} = require('./helpers/factories');

const REAL = { name: 'Real Person', email: 'real.person@gmail.com' };
const SAMPLE = { name: 'Sita Gurung', email: 'sita.gurung@sample.example.com' };

let savedFlag;
let demoToken;
let realOrder;
let sampleOrder;
let realContact;

beforeEach(async () => {
  savedFlag = process.env.DEMO_ACCOUNTS_ENABLED;
  process.env.DEMO_ACCOUNTS_ENABLED = 'true';
  await seedDemoAccounts();

  const { user: real } = await createUser(REAL);
  const { user: sample } = await createUser(SAMPLE);
  const cake = await createCake({ category: (await createCategory())._id });

  realOrder = await createOrder(real._id, { paymentStatus: 'paid', contactEmail: REAL.email });
  sampleOrder = await createOrder(sample._id, { paymentStatus: 'paid' });
  await createReview(real._id, cake._id, { reviewerName: REAL.name, isApproved: false });
  await createReview(sample._id, cake._id, { reviewerName: SAMPLE.name, isApproved: false });
  realContact = await Contact.create({
    name: REAL.name,
    email: REAL.email,
    subject: 'Allergy question',
    message: 'Do you have nut-free cakes?',
  });

  demoToken = (await request(app).post('/api/users/demo-login').send({ role: 'admin' })).body.token;
});

afterEach(async () => {
  if (savedFlag === undefined) delete process.env.DEMO_ACCOUNTS_ENABLED;
  else process.env.DEMO_ACCOUNTS_ENABLED = savedFlag;
  await Promise.all([
    User.deleteMany({}),
    Order.deleteMany({}),
    Review.deleteMany({}),
    Contact.deleteMany({}),
  ]);
});

const ADMIN_READS = [
  '/api/users/customers',
  '/api/orders/admin/all',
  '/api/orders/admin/stats',
  '/api/analytics/overview',
  '/api/analytics/revenue-trends',
  '/api/analytics/top-products',
  '/api/analytics/categories',
  '/api/analytics/customers',
  '/api/analytics/time-trends',
  '/api/analytics/order-status',
  '/api/analytics/recent-activity',
  '/api/reviews/admin/all',
  '/api/contact',
];

describe('demo admin never sees real customers', () => {
  it.each(ADMIN_READS)('%s leaves real customers out', async (path) => {
    const res = await request(app).get(path).set(auth(demoToken));

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(REAL.email);
    expect(body).not.toContain(REAL.name);
    expect(body).not.toContain(realOrder.orderNumber);
  });

  it('still sees the showcase data', async () => {
    const customers = await request(app).get('/api/users/customers').set(auth(demoToken));
    const orders = await request(app).get('/api/orders/admin/all').set(auth(demoToken));

    expect(JSON.stringify(customers.body)).toContain(SAMPLE.email);
    expect(orders.body.data.map((o) => o.orderNumber)).toEqual([sampleOrder.orderNumber]);
  });

  it('counts only showcase data in the dashboard totals', async () => {
    const res = await request(app).get('/api/analytics/overview').set(auth(demoToken));

    expect(res.body.data.orders.current).toBe(1);
    expect(res.body.data.revenue.current).toBe(sampleOrder.total);
  });

  it("cannot open a real customer's order or payment status directly", async () => {
    const byId = await request(app).get(`/api/orders/${realOrder._id}`).set(auth(demoToken));
    const byNumber = await request(app)
      .get(`/api/orders/number/${realOrder.orderNumber}`)
      .set(auth(demoToken));
    const payment = await request(app).get(`/api/esewa/status/${realOrder._id}`).set(auth(demoToken));
    const sample = await request(app).get(`/api/orders/${sampleOrder._id}`).set(auth(demoToken));

    expect(byId.status).toBe(403);
    expect(byNumber.status).toBe(403);
    expect(payment.status).toBe(403);
    expect(sample.status).toBe(200);
  });

  it('cannot open a real contact message, or mark it read by trying', async () => {
    const res = await request(app).get(`/api/contact/${realContact._id}`).set(auth(demoToken));

    expect(res.status).toBe(404);
    expect((await Contact.findById(realContact._id)).status).toBe('new');
  });
});

describe('real admins are unaffected', () => {
  it('sees every customer, order, review and message', async () => {
    const { token } = await createAdmin();

    const customers = await request(app).get('/api/users/customers').set(auth(token));
    const orders = await request(app).get('/api/orders/admin/all').set(auth(token));
    const reviews = await request(app).get('/api/reviews/admin/all').set(auth(token));
    const contacts = await request(app).get('/api/contact').set(auth(token));
    const order = await request(app).get(`/api/orders/${realOrder._id}`).set(auth(token));

    expect(JSON.stringify(customers.body)).toContain(REAL.email);
    expect(orders.body.data).toHaveLength(2);
    expect(JSON.stringify(reviews.body)).toContain(REAL.name);
    expect(JSON.stringify(contacts.body)).toContain(REAL.email);
    expect(order.status).toBe(200);
  });
});
