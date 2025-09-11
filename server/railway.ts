import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration for Railway backend
const corsOptions = {
  origin: [
    'https://enrollment.getmydpc.com',  // Production custom domain on Vercel
    'https://getmydpc-enrollment.vercel.app',  // Production Vercel domain
    /^https:\/\/getmydpc-enrollment-.*\.vercel\.app$/,  // Vercel preview deployments
    'http://localhost:5173',  // Local development
    'http://localhost:5000'   // Local development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    platform: 'railway'
  });
});

// Register all API routes
registerRoutes(app);

// Start server
app.listen(PORT, () => {
  console.log(`[Railway] Server running on port ${PORT}`);
  console.log(`[Railway] Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`[Railway] CORS enabled for Vercel frontend`);
});

export default app;