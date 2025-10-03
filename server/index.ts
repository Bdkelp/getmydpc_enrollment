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

// CORS setup - comprehensive for Railway + Vercel deployment
app.use(
  cors({
    origin: function (
      origin: string | undefined,
      callback: (err: Error | null, origin?: boolean) => void,
    ) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Comprehensive list of allowed origins
      const allowedOrigins: (string | RegExp)[] = [
        // Production domains
        "https://getmydpcenrollment-production.up.railway.app",
        "https://enrollment.getmydpc.com",
        "https://shimmering-nourishment.up.railway.app",
        
        // Development domains
        /^https:\/\/.*\.replit\.dev$/,


// Handle OPTIONS preflight requests for all API routes
app.options('/api/*', (req, res) => {
  const origin = req.headers.origin;
  console.log('[OPTIONS] Preflight request from:', origin);
  
  // Set CORS headers explicitly
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH,HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Cache-Control,X-File-Name,X-CSRF-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

        /^https:\/\/.*\.replit\.app$/,
        /^https:\/\/.*\.vercel\.app$/,
        /^https:\/\/.*\.railway\.app$/,
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        
        // Environment variable URL
        process.env.VITE_PUBLIC_URL,
      ].filter((item): item is string | RegExp => Boolean(item));

      const isAllowed = allowedOrigins.some((pattern) => {
        if (typeof pattern === "string") {
          return origin === pattern;
        }
        return pattern.test(origin);
      });

      if (isAllowed) {
        console.log('[CORS] Allowed origin:', origin);
        callback(null, true);
      } else {
        console.log('[CORS] Blocked origin:', origin);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-File-Name',
      'X-CSRF-Token'
    ],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 hours
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
  // Register EPX routes FIRST to prevent route conflicts
  app.use('/', epxRoutes);
  
  // Register all other API routes (includes auth endpoints)
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