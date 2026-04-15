const dns = require("dns");
const mongoose = require("mongoose");

const DNS_SERVERS = ["8.8.8.8", "1.1.1.1", "8.8.4.4"];

const connectDB = async (retries = 3, delay = 3000) => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured.");
  }

  if (mongoUri.startsWith("mongodb+srv://")) {
    dns.setServers(DNS_SERVERS);
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const conn = await mongoose.connect(mongoUri);
      console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    } catch (error) {
      console.error(`MongoDB connection error (attempt ${attempt}/${retries}): ${error.message}`);
      if (attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
};

module.exports = connectDB;
