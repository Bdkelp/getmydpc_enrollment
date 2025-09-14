import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Comprehensive CORS configuration for Railway backend
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://enrollment.getmydpc.com',                    // Production Vercel domain
      'https://shimmering-nourishment.up.railway.app',     // Railway backend domain
      'http://localhost:3000',                             // Local React dev server
      'http://localhost:5173',                             // Vite dev server
      /\.vercel\.app$/,                                     // Any Vercel preview deployments
      /\.railway\.app$/                                     // Any Railway deployments
    ];

    const isAllowed = allowedOrigins.some((pattern) => {
      if (typeof pattern === 'string') {
        return origin === pattern;
      }
      return pattern.test(origin);
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`[CORS] Blocked origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Explicit preflight handling for all routes
app.options('*', (req, res) => {
  console.log(`[CORS Preflight] ${req.method} ${req.path} from origin: ${req.headers.origin}`);
  
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Cache-Control,X-File-Name');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
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
    'http://localhost:5173'
  ];
  
  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
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