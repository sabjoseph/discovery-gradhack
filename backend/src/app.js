const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
    res.json({
      success: true,
      message: "🚀 BiteBetter API is running!",
      version: "1.0.0",
    });
  });
  
  module.exports = app;