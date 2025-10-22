import dotenv from "dotenv";

// Load environment variables from .env file FIRST
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import { WeeklyRecapService } from "./services/weekly-recap-service";
import epxHostedRoutes from "./routes/epx-hosted-routes";
import adminLogsRoutes from "./routes/admin-logs";
import adminDatabaseRoutes from "./routes/admin-database";
import debugPaymentsRoutes from './routes/debug-payments';
import debugRecentPaymentsRoutes from './routes/debug-recent-payments';
import devUtilitiesRoutes from "./routes/dev-utilities";

const app = express();

// Set trust proxy for proper IP handling
app.set("trust proxy", true);

// Body parsing middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// CORS setup - production deployment configuration
app.use(
  cors({
    origin: [
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.railway\.app$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
      "https://getmydpcenrollment-production.up.railway.app",
      "https://enrollment.getmydpc.com",
      "http://localhost:5173",
      "http://localhost:5000"
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// Debug middleware to log all routes
app.use('*', (req, res, next) => {
  if (req.path.includes('/api/epx/')) {
    console.log(`[Route Debug] ${req.method} ${req.path} - EPX route accessed`);
  }
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register EPX Hosted Checkout routes (existing, always active)
  app.use('/', epxHostedRoutes);
  
  // Register all API routes
  const server = await registerRoutes(app);

  // Register additional admin/debug routes
  app.use('/', adminLogsRoutes);
  app.use('/', adminDatabaseRoutes);
  app.use('/', debugPaymentsRoutes);
  app.use('/', debugRecentPaymentsRoutes);
  app.use('/', devUtilitiesRoutes);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Error handler caught:", err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use Railway's PORT environment variable in production, fallback to 5000 for local dev
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
  const serverInstance = server.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
      console.log(`Server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log('EPX Hosted Checkout service configured and ready');

      // Initialize weekly recap service
      WeeklyRecapService.scheduleWeeklyRecap();

      // Validate EPX configuration
      try {
        console.log('[Server] Validating EPX configuration...');
        console.log('[Server] EPX Environment Variables:', {
            EPX_CUST_NBR: process.env.EPX_CUST_NBR || 'NOT SET',
            EPX_MERCH_NBR: process.env.EPX_MERCH_NBR || 'NOT SET',
            EPX_DBA_NBR: process.env.EPX_DBA_NBR || 'NOT SET',
            EPX_TERMINAL_NBR: process.env.EPX_TERMINAL_NBR || 'NOT SET',
            EPX_MAC: process.env.EPX_MAC ? 'SET' : 'NOT SET',
            EPX_MAC_KEY: process.env.EPX_MAC_KEY ? 'SET' : 'NOT SET',
            MAC_RESOLVED: (process.env.EPX_MAC || process.env.EPX_MAC_KEY) ? 'SET' : 'NOT SET'
          });
      } catch (error) {
        console.warn('[Server] EPX configuration check failed:', error.message);
      }

      return serverInstance;
    },
  );
})();

export default app;