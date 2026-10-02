/**
 * k6 load test - a browsing shopper's journey.
 *
 * Each virtual user logs in once, then repeatedly: views the homepage data,
 * browses the menu, opens a cake, adds it to the cart, views the cart, and
 * empties it. Checkout is deliberately not part of this first journey.
 *
 * Run against a LOCAL stack only (it writes carts). Raise the rate limiter
 * first or you will measure 429s instead of the app:
 *   RATE_LIMIT_SCALE=1000 node server.js
 *
 * USAGE:
 *   node scripts/k6/seed-k6-users.js --count=100
 *   k6 run scripts/k6/shopper-journey.js
 *   k6 run -e BASE_URL=http://localhost:5000 -e PEAK_VUS=50 scripts/k6/shopper-journey.js
 *   node scripts/k6/seed-k6-users.js --cleanup
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const PEAK_VUS = Number(__ENV.PEAK_VUS || 50);
const PASSWORD = 'K6LoadTest123!';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  setupTimeout: '180s',
  stages: [
    { duration: '20s', target: PEAK_VUS }, // ramp up
    { duration: '60s', target: PEAK_VUS }, // hold
    { duration: '10s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // Login is bcrypt-bound (slow by design), so it gets its own budget and
    // every other request is held to a tighter one.
    'http_req_duration{name:login}': ['p(95)<1500'],
    'http_req_duration{name:featured_cakes}': ['p(95)<400'],
    'http_req_duration{name:list_cakes}': ['p(95)<400'],
    'http_req_duration{name:cake_detail}': ['p(95)<400'],
    'http_req_duration{name:add_to_cart}': ['p(95)<600'],
    'http_req_duration{name:view_cart}': ['p(95)<400'],
    checks: ['rate>0.99'],
  },
};

// Runs once before the test: grab real cakes so the journey adds items that exist.
export function setup() {
  const res = http.get(`${BASE_URL}/api/cakes?limit=20`);
  const cakes = (res.json('data') || []).filter(
    (c) => c.weightOptions && c.weightOptions.length > 0
  );
  if (cakes.length === 0) {
    throw new Error('No cakes returned by /api/cakes - seed the catalog first.');
  }
  // LOGIN_IN_SETUP=1: log everyone in one at a time BEFORE the measured
  // window, so the run measures steady-state browsing instead of a login
  // storm. Without it, all VUs log in together at ramp-up (the default).
  let tokens = null;
  if (__ENV.LOGIN_IN_SETUP) {
    tokens = [];
    for (let i = 1; i <= PEAK_VUS; i++) {
      const res = http.post(
        `${BASE_URL}/api/users/login`,
        JSON.stringify({ email: `k6user${i}@seedmail.dev`, password: PASSWORD }),
        { headers: JSON_HEADERS }
      );
      tokens.push(res.status === 200 ? res.json('token') : null);
    }
  }

  return {
    tokens,
    cakes: cakes.map((c) => ({
      id: c._id,
      slug: c.slug,
      weight: c.weightOptions[0],
    })),
  };
}

let token = null; // per-VU: each virtual user keeps its own copy

function login() {
  const email = `k6user${__VU}@seedmail.dev`;
  const res = http.post(
    `${BASE_URL}/api/users/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: JSON_HEADERS, tags: { name: 'login' } }
  );
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  token = ok ? res.json('token') : null;
}

export default function (data) {
  if (!token && data.tokens) token = data.tokens[__VU - 1];
  if (!token) {
    login();
    if (!token) {
      sleep(1);
      return;
    }
  }
  const authHeaders = { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
  const cake = data.cakes[Math.floor(Math.random() * data.cakes.length)];

  group('homepage', () => {
    const featured = http.get(`${BASE_URL}/api/cakes/featured`, {
      tags: { name: 'featured_cakes' },
    });
    check(featured, { 'featured 200': (r) => r.status === 200 });
  });
  sleep(Math.random() * 2 + 1);

  group('browse menu', () => {
    const list = http.get(`${BASE_URL}/api/cakes`, { tags: { name: 'list_cakes' } });
    check(list, {
      'list 200': (r) => r.status === 200,
      'list has data': (r) => (r.json('data') || []).length > 0,
    });
  });
  sleep(Math.random() * 2 + 1);

  group('cake detail', () => {
    const detail = http.get(`${BASE_URL}/api/cakes/${cake.slug}`, {
      tags: { name: 'cake_detail' },
    });
    check(detail, { 'detail 200': (r) => r.status === 200 });
  });
  sleep(Math.random() * 2 + 1);

  group('cart', () => {
    const add = http.post(
      `${BASE_URL}/api/cart`,
      JSON.stringify({
        cakeId: cake.id,
        quantity: 1,
        selectedWeight: {
          weightInKg: cake.weight.weightInKg,
          label: cake.weight.label,
          price: cake.weight.price,
        },
      }),
      { headers: authHeaders, tags: { name: 'add_to_cart' } }
    );
    check(add, { 'add to cart 2xx': (r) => r.status === 200 || r.status === 201 });

    const view = http.get(`${BASE_URL}/api/cart`, {
      headers: authHeaders,
      tags: { name: 'view_cart' },
    });
    check(view, { 'view cart 200': (r) => r.status === 200 });

    // Empty it so the cart stays small across iterations.
    http.del(`${BASE_URL}/api/cart`, null, {
      headers: authHeaders,
      tags: { name: 'clear_cart' },
    });
  });
  sleep(Math.random() * 2 + 1);
}
