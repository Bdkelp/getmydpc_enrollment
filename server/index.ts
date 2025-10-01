import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import { initializeEPXService } from "./services/epx-payment-service";
import { WeeklyRecapService } from "./services/weekly-recap-service";
import epxRoutes from "./routes/epx-routes";
import adminLogsRoutes from "./routes/admin-logs";
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

// CORS setup - improved for Replit deployment
app.use(
  cors({
    origin: function (
      origin: string | undefined,
      callback: (err: Error | null, origin?: boolean) => void,
    ) {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);

      // Allow Replit domains and production domain
      const allowedOrigins: (string | RegExp)[] = [
        /\.replit\.dev$/,
        /\.replit\.app$/,
        /^https:\/\/.*\.replit\.dev$/,
        /^https:\/\/.*\.replit\.app$/,
        /^https:\/\/.*\.vercel\.app$/,
        /^https:\/\/.*\.railway\.app$/,
        /^http:\/\/localhost:\d+$/,  // Allow any localhost port for dev
        /^http:\/\/127\.0\.0\.1:\d+$/,  // Allow 127.0.0.1 for dev
        "https://getmydpcenrollment-production.up.railway.app",
        "https://enrollment.getmydpc.com",
        process.env.VITE_PUBLIC_URL,
      ].filter((item): item is string | RegExp => Boolean(item));

      const isAllowed = allowedOrigins.some((pattern) => {
        if (typeof pattern === "string") {
          return origin === pattern;
        }
        return pattern.test(origin);
      });

      callback(null, isAllowed);
    },
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
  // Register EPX routes FIRST before other routes
  app.use('/', epxRoutes);
  
  // Register all API routes
  const server = await registerRoutes(app);

  // Register additional admin/debug routes
  app.use('/', adminLogsRoutes);
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

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  const serverInstance = server.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
      console.log(`Server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`EPX Service configured: Browser Post ready`);

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
            MAC_RESOLVED: (process.env.EPX_MAC || process.env.EPX_MAC_KEY) ? 'SET' : 'NOT SET',
            BASE_URL: process.env.REPLIT_DEV_DOMAIN
          });
      } catch (error) {
        console.warn('[Server] EPX configuration check failed:', error.message);
      }

      return serverInstance;
    },
  );
})();

export default app;