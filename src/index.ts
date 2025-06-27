import express from 'express';
import cors from 'cors';
import auditRoutes from './routes/audit.routes.js';
import lighthouseRoutes from './routes/lighthouse.routes.js';
import screenshotRoutes from './routes/screenshot.routes.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/audit', auditRoutes);
app.use('/lighthouse', lighthouseRoutes);
app.use('/screenshot', screenshotRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'scan-service' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Scan Service running on port ${PORT}`);
});

export default app;
