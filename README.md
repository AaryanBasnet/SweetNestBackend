# 🍰 SweetNest Backend

**SweetNest Backend** is the server-side application powering the SweetNest custom cake ordering platform. It provides secure authentication, business logic, data persistence, payments, notifications, and admin operations via a RESTful API.

This repository contains **only the backend codebase**. The frontend lives in a separate repository and consumes these APIs.

---

## ✨ Overview

The backend is responsible for:

* User authentication & authorization
* Cake, category, and order management
* Loyalty rewards & promotions
* Payment processing with eSewa
* Notifications and email delivery
* Admin analytics and dashboards

It is designed with scalability, validation, and clean separation of concerns in mind.

---

## 🛠 Tech Stack

* **Node.js**
* **Express 5** – REST API framework
* **MongoDB** – database
* **Mongoose** – ODM
* **JWT** – authentication & role-based access
* **Zod** – request validation
* **Cloudinary** – image storage
* **Nodemailer** – email notifications
* **eSewa** – payment gateway integration

---

## 🚀 Features

### Core Features

* User registration, login, password reset
* Role-based access control (Admin / Customer)
* Cake & category CRUD operations
* Cart & order processing
* Order status lifecycle management
* Sweet Points loyalty rewards system
* Promo codes & discounts
* Reviews & ratings
* Address management
* Secure payment verification (eSewa)

### Admin Features

* Product & category management
* Order monitoring & status updates
* Customer management
* Promotion & coupon management
* Notification broadcasting
* Analytics & KPIs endpoints

---

## 📁 Project Structure

```bash
SweetNestBackend/
├── config/         # DB, Cloudinary, email configuration
├── model/          # Mongoose schemas
├── routes/         # API route definitions
├── controller/     # Business logic
├── middleware/     # Auth, error handling, guards
├── validators/     # Zod validation schemas
├── utils/          # Helper utilities
├── tests/          # Jest + Supertest suite
│   ├── setup/      # DB lifecycle, test env, isolation
│   ├── helpers/    # Test data factories
│   └── mocks/      # Stubs (email)
├── app.js          # Express app (exported, no listen - testable)
├── server.js       # Process entry: config, DB, listen, shutdown
└── package.json
```

---

## ⚙️ Setup & Installation

### Prerequisites

* Node.js **v16+**
* MongoDB (Local or Atlas)
* Cloudinary account
* Gmail account (App Password enabled)
* eSewa merchant account

---

### Installation

```bash
npm install
```

---

## 🔐 Environment Variables

Create a `.env` file in the root of the backend project:

```env
PORT=5000
DB_URL=mongodb://localhost:27017/SweetNestDatabase
JWT_SECRET=your_jwt_secret_here
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_app_password
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
ESEWA_MERCHANT_ID=your_merchant_id
ESEWA_SECRET_KEY=your_secret_key
FRONTEND_URL=http://localhost:5173
```

---

## ▶️ Running the Server

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

The API will be available at:

```
http://localhost:5000
```

---

## 🔌 API Overview

Main API modules:

* `/api/users` – Authentication & user management
* `/api/cakes` – Cake products
* `/api/categories` – Categories
* `/api/cart` – Cart operations
* `/api/orders` – Orders
* `/api/reviews` – Reviews & ratings
* `/api/wishlist` – Wishlist
* `/api/addresses` – Address management
* `/api/notifications` – Notifications
* `/api/promotions` – Coupons & promotions
* `/api/rewards` – Loyalty points
* `/api/analytics` – Admin analytics
* `/api/esewa` – Payment processing

---

## 🧪 Testing

```bash
npm test              # run the suite
npm run test:watch    # re-run on change
npm run test:coverage # with a coverage report
npm run lint          # eslint
```

**147 tests** covering authentication, password reset, the auth middleware,
cart pricing, order creation and ownership, eSewa payments, review voting and
rate limiting.

### How the database works in tests

Tests run against a **real MongoDB**, not a mock. Mocking the database would
let query bugs - a wrong operator, a condition that does not do what you think
- pass the suite, which is exactly the class of bug these tests exist to catch.

* **Locally**: `tests/setup/globalSetup.js` starts an ephemeral in-memory
  `mongod` (via `mongodb-memory-server`). Nothing to install or configure.
* **In CI**: a `mongo:7` service container is used instead, via the
  `MONGO_TEST_URI` environment variable.

Every test starts against empty collections (`tests/setup/jest.setup.js`), so
no test can depend on another one's leftovers.

### Pinned dependency: `mongodb` < 7.6.0

`package.json` carries an `overrides` entry pinning the MongoDB driver:

```json
"overrides": { "mongodb": "<7.6.0" }
```

**Why:** driver `7.6.0` drops the `driver` sub-document from the client
handshake metadata when running inside Jest, and the server rejects the
connection with:

```
MongooseServerSelectionError: Missing required sub-document 'driver'
in the client metadata document
```

It reproduces on a bare Jest config with no project setup involved, and it
does **not** happen outside Jest - the same connection works in a plain Node
script. Driver `7.5.0` and below are unaffected.

The range (rather than an exact pin) still allows 7.5.x patch releases.
Remove the override once a 7.6.x release fixes the handshake, and re-run the
suite to confirm.

### Coverage

Thresholds are a **ratchet, not a target** - set just below current levels so
a drop fails the build. Payment and authentication code is held to a much
higher bar than the codebase average, because that is where a regression
actually costs something:

| Area | Statements |
| --- | --- |
| `controller/esewaController.js` | 90% |
| `middleware/authMiddleware.js` | 100% |
| `middleware/rateLimitMiddleware.js` | 100% |
| `controller/userController.js` | 74% |

Analytics, notifications, promotions and wishlist are not yet covered - that
is the next area to pick up.

### Writing a test

Use the factories in `tests/helpers/factories.js` rather than assembling
documents by hand:

```js
const { createUser, createCake, auth } = require('./helpers/factories');

const { user, token } = await createUser();
const cake = await createCake();

await request(app).post('/api/cart').set(auth(token)).send({ ... });
```

---

## 🔄 Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull
request:

* **Lint** – `eslint`
* **Test** – full suite on Node 20 and 22, against a MongoDB service container
* **Audit** – fails on any high or critical dependency advisory

---

## 🧪 Development Notes

* Validation is enforced at the API boundary using **Zod**
* JWT middleware protects authenticated & admin-only routes
* Business logic is isolated in controllers
* Sensitive operations are guarded with role checks
* `app.js` exports the Express app without listening; `server.js` owns the
  process. That split is what lets Supertest drive the API in memory.

---

## 🔗 Related Repositories

* **SweetNest Frontend** – React, Zustand, React Query (separate repo)

---

## 📄 License

This project is **proprietary software**. All rights reserved.
