import express from 'express';
import cors from 'cors';
import { registerRoutes } from '../routes';
import epxHostedRoutes from '../routes/epx-hosted-routes'; // Hosted Checkout (new)

const app = express();
const PORT = process.env.PORT || 3000;

// Archived Railway-specific server file retained for history.
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: [
    'https://enrollment.getmydpc.com',
    'http://localhost:3000',
    'http://localhost:5173',
    /\.vercel\.app$/,
    /\.getmydpc\.com$/
  ],
  credentials: true
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', platform: 'railway-archived' });
});

(async () => {
  try {
    await registerRoutes(app);
    app.use('/', epxHostedRoutes);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`▲ Archived Railway server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start archived Railway server:', err);
  }
})();
