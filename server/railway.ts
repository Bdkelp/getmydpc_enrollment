
import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: [
    'https://enrollment.getmydpc.com',
    'https://getmydpc-enrollment.vercel.app',
    /^https:\/\/getmydpc-enrollment-.*\.vercel\.app$/,
    'http://localhost:5173',
    'http://localhost:5000',
    // Add Railway domain for debugging
    /^https:\/\/.*\.up\.railway\.app$/,
    // Add current Railway domain
    'https://shimmering-nourishment.up.railway.app'
  ],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept','Origin','Cache-Control','X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200 // For legacy browser support
};

app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options('*', cors(corsOptions));

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
  next();
});

// Health (non-API) so you can sanity check the container
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    platform: 'railway',
    cors: 'enabled',
    routes: 'registered',
    port: PORT
  });
});

// Additional debugging endpoint
app.get('/api/debug/cors', (req, res) => {
  res.json({
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    method: req.method,
    headers: Object.keys(req.headers),
    corsAllowed: corsOptions.origin
  });
});

(async () => {
  try {
    // ⬇️ THIS WAS THE MISSING AWAIT
    await registerRoutes(app);

    app.listen(PORT, () => {
      console.log(`[Railway] Server running on port ${PORT}`);
      console.log(`[Railway] Environment: ${process.env.NODE_ENV || 'production'}`);
      console.log(`[Railway] CORS enabled for Vercel frontend`);
    });
  } catch (err) {
    console.error('[Railway] Failed to register routes', err);
    process.exit(1);
  }
})();
export default app;
