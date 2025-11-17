
import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes';
// import epxRoutes from './routes/epx-routes'; // Browser Post (old - removed)
import epxHostedRoutes from './routes/epx-hosted-routes'; // Hosted Checkout (new)

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

// EPX health check specifically
app.get('/api/epx/health-check', (req, res) => {
  console.log('[Railway] EPX health check called');
  res.json({
    status: 'ok',
    service: 'EPX Hosted Checkout Service',
    environment: process.env.EPX_ENVIRONMENT || 'sandbox',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/epx/hosted/health',
      config: '/api/epx/hosted/config', 
      createPayment: '/api/epx/hosted/create-payment',
      callback: '/api/epx/hosted/callback'
    }
  });
});

// Register all other routes first
(async () => {
  try {
    await registerRoutes(app);
    
    // Register EPX routes after other routes are loaded
    app.use('/', epxHostedRoutes); // Using Hosted Checkout routes
    
    // Add route debugging
    console.log('✅ Registered routes:');
    app._router.stack.forEach((middleware, index) => {
      if (middleware.route) {
        console.log(`  ${middleware.route.stack[0].method.toUpperCase()} ${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            console.log(`  ${handler.route.stack[0].method.toUpperCase()} ${handler.route.path}`);
          }
        });
      }
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Railway server running on port ${PORT}`);
      console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✅ CORS enabled for enrollment.getmydpc.com`);
      console.log(`✅ EPX Hosted Checkout endpoints available at /api/epx/hosted/*`);
      console.log(`✅ EPX health endpoint: /api/epx/hosted/health`);
      console.log(`✅ EPX create payment endpoint: /api/epx/hosted/create-payment`);
      console.log(`✅ EPX callback endpoint: /api/epx/hosted/callback`);
    });
  } catch (error) {
    console.error('❌ Failed to start Railway server:', error);
    process.exit(1);
  }
})();
