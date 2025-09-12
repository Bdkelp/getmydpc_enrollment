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
  ],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Health (non-API) so you can sanity check the container
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    platform: 'railway',
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
