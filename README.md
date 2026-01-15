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
├── app.js          # Express app setup
├── server.js       # Server entry point
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

## 🧪 Development Notes

* Validation is enforced at the API boundary using **Zod**
* JWT middleware protects authenticated & admin-only routes
* Business logic is isolated in controllers
* Sensitive operations are guarded with role checks

---

## 🔗 Related Repositories

* **SweetNest Frontend** – React, Zustand, React Query (separate repo)

---

## 📄 License

This project is **proprietary software**. All rights reserved.
