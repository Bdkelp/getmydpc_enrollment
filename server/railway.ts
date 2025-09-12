import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS configuration for Railway backend
app.use(cors({
  origin: [
    'https://enrollment.getmydpc.com',  // Production Vercel domain
    'http://localhost:3000',            // Local React dev server
    'http://localhost:5173'             // Vite dev server
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check
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
});

export default app;