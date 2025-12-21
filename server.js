const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");

const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const cakeRoutes = require('./routes/cakeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');

const { errorHandler, notFound } = require('./middleware/errorMiddleware');

const connectDB = require("./config/db");

const app = express();
app.use(cors());
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

//  error handlers

// notFound: middleware that catches any request to a route that doesn’t exist.
// errorHandler: middleware that handles any errors thrown in controllers or anywhere else in Express.
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
