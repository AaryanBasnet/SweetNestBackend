const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");

const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const cakeRoutes = require('./routes/cakeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const esewaRoutes = require('./routes/esewaRoutes');
const addressRoutes = require('./routes/addressRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');





const { errorHandler, notFound } = require('./middleware/errorMiddleware');

const connectDB = require("./config/db");

const app = express();
// ✅ Enhanced CORS configuration - explicit for browser compatibility
const corsOptions = {
  origin: function (origin, callback) {
    // Allow localhost and ngrok URLs
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL || 'http://localhost:5173',
    ];

    // Allow requests with no origin (like curl, Postman, mobile apps)
    if (!origin) {
      return callback(null, true);
    }

    // Allow ngrok URLs (for ngrok tunnels)
    if (origin.includes('ngrok')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Also allow in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Connect DB BEFORE starting server
connectDB();

app.get("/", (req, res) => {
  res.send("API Running...");
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cakes', cakeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/esewa', esewaRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);




//  error handlers

// notFound: middleware that catches any request to a route that doesn’t exist.
// errorHandler: middleware that handles any errors thrown in controllers or anywhere else in Express.
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
