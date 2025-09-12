import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// CORS for Vercel + local + Railway previews
const corsOptions: cors.CorsOptions = {
  origin: [
    'https://enrollment.getmydpc.com',
    'https://getmydpc-enrollment.vercel.app',
    /^https:\/\/getmydpc-enrollment-.*\.vercel\.app$/,
    /^https:\/\/.*\.up\.railway\.app$/,
    'http://localhost:5173',
    'http://localhost:5000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
};

app.use(cors(corsOptions));
// make sure OPTIONS preflight gets proper CORS headers
app.options('*', cors(corsOptions));

app.use(express.json());

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    platform: 'railway',
  });
});

// API
registerRoutes(app);

app.listen(PORT, () => {
  console.log(`[Railway] Server running on ${PORT}`);
});
export default app;
