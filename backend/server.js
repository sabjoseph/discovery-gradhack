require("dotenv").config();

const app = require("./src/app");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// const express = require("express");
// const cors = require("cors");

// const app = express();

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Health check route
// app.get("/", (req, res) => {
//   res.json({
//     success: true,
//     message: "🚀 BiteBetter API is running!",
//     version: "1.0.0",
//   });
// });

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log(`✅ Server running on http://localhost:${PORT}`);
// });