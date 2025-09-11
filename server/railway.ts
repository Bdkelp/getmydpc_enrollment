import express from "express";
import { registerRoutes } from "./routes";
import cors from "cors";
import { initializeEPXService } from "./services/epx-payment-service";
import { WeeklyRecapService } from "./services/weekly-recap-service";
import epxRoutes from "./routes/epx-routes";
import adminLogsRoutes from "./routes/admin-logs";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS setup for Railway
app.use(
  cors({
    origin: [
      "https://enrollment.getmydpc.com",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// API logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      console.log(
        `${req.method} ${req.path} ${res.statusCode} in ${duration}ms`,
      );
    }
  });
  next();
});

(async () => {
  // Register all routes
  await registerRoutes(app);
  app.use(epxRoutes);
  app.use(adminLogsRoutes);

  // Error handler
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Error handler caught:", err);
      res.status(status).json({ message });
    },
  );

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`API server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);

    // Initialize services
    WeeklyRecapService.scheduleWeeklyRecap();
  });
})();

export default app;
