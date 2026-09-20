const mongoose = require('mongoose');

/**
 * Connect to MongoDB.
 *
 * The caller must await this before accepting traffic. Previously the server
 * called listen() without waiting, so requests arriving during a cold start
 * hit an unconnected driver and failed.
 */
const connectDB = async () => {
  const connectionString = process.env.DB_URL;

  if (!connectionString) {
    throw new Error('DB_URL is not set');
  }

  const conn = await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 10000,
  });

  // SECURITY: log the host, never the connection string - it carries the
  // database username and password, and application logs are not a secret store.
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

  return conn;
};

module.exports = connectDB;
