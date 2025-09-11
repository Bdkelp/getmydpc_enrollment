const express = require("express");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: ["https://enrollment.getmydpc.com"],
    credentials: true,
  }),
);

// Simple health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Simple auth endpoint for testing
app.get("/api/auth/me", (req, res) => {
  res.status(401).json({ message: "No token provided" });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});

module.exports = app;
