const express = require('express');
const cors = require('cors');
const path = require("path");
const userRoutes = require("./routes/userRoutes");
const gameRoutes = require("./routes/gameRoutes");
const leaderboardRoutes = require("./routes/leaderboardRoutes");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "..", "public")));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

// Root route - serve the main HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Multiplayer route
app.get("/multiplayer", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "multiplayer.html"));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Export for Vercel serverless functions
module.exports = app;
