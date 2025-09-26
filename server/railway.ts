
import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';
import epxRoutes from './routes/epx-routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Set trust proxy for Railway
app.set('trust proxy', 1);

// Parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Comprehensive CORS configuration for Railway backend
app.use(cors({
  origin: [
    'https://enrollment.getmydpc.com',
    'https://getmydpc-enrollment.vercel.app',
    'https://getmydpc.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    /\.vercel\.app$/,
    /\.getmydpc\.com$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'railway'
  });
});

// Register EPX routes first
app.use(epxRoutes);

// Register all other routes
(async () => {
  try {
    await registerRoutes(app);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Railway server running on port ${PORT}`);
      console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✅ CORS enabled for enrollment.getmydpc.com`);
      console.log(`✅ EPX endpoints available`);
    });
  } catch (error) {
    console.error('❌ Failed to start Railway server:', error);
    process.exit(1);
  }
})();
