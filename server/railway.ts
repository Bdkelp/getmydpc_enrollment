import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Comprehensive CORS configuration for Railway backend
const corsOptions = {
  origin: [
    'https://enrollment.getmydpc.com',                    // Production Vercel domain
    'https://shimmering-nourishment.up.railway.app',     // Railway backend domain
    'http://localhost:3000',                             // Local React dev server
    'http://localhost:5173',                             // Vite dev server
    'http://localhost:5000',                             // Replit dev server
    'https://localhost:3000',                            // HTTPS localhost
    'https://localhost:5173',                            // HTTPS localhost
    'https://ffd2557a-af4c-48a9-9a30-85d2ce375e45-00-pjr5zjuzb5vw.worf.replit.dev', // Current Replit domain
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  console.log(`[CORS Preflight] ${req.method} ${req.path} from origin: ${origin}`);

  // Check if origin is allowed
  if (corsOptions.origin.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,X-File-Name');
    res.header('Access-Control-Max-Age', '86400');
    console.log(`[CORS] Preflight approved for origin: ${origin}`);
  } else {
    console.log(`[CORS] Preflight blocked for origin: ${origin}`);
  }

  res.status(200).end();
});

app.use(express.json());

// Add explicit CORS headers to all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://enrollment.getmydpc.com',
    'https://shimmering-nourishment.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000',
    'https://ffd2557a-af4c-48a9-9a30-85d2ce375e45-00-pjr5zjuzb5vw.worf.replit.dev'
  ];

  // Also check regex patterns for dynamic domains
  const regexPatterns = [/\.vercel\.app$/, /\.railway\.app$/, /\.replit\.dev$/];
  const isAllowedByRegex = origin && regexPatterns.some(pattern => pattern.test(origin));

  if (allowedOrigins.includes(origin as string) || isAllowedByRegex) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Cache-Control,X-File-Name');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    platform: 'railway'
  });
});

// CORS test endpoint to verify CORS is working
app.get('/api/test-cors', (req, res) => {
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    platform: 'railway'
  });
});

// Additional CORS test endpoint (alternative naming)
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: 'CORS test successful!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    platform: 'railway',
    status: 'ok'
  });
});

// CORS debug endpoint
app.get('/api/debug/cors', (req, res) => {
  const origin = req.headers.origin;
  const userAgent = req.headers['user-agent'];

  console.log(`[CORS Debug] Request from origin: ${origin}`);

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    requestOrigin: origin,
    userAgent: userAgent,
    platform: 'railway',
    corsHeaders: {
      'access-control-allow-origin': res.getHeader('access-control-allow-origin'),
      'access-control-allow-credentials': res.getHeader('access-control-allow-credentials'),
      'access-control-allow-methods': res.getHeader('access-control-allow-methods'),
      'access-control-allow-headers': res.getHeader('access-control-allow-headers')
    },
    environment: process.env.NODE_ENV || 'production'
  });
});

// Register all API routes
registerRoutes(app);

// Start server
app.listen(PORT, () => {
  console.log(`[Railway] Server running on port ${PORT}`);
});

export default app;