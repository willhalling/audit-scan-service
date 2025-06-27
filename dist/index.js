import express from 'express';
import cors from 'cors';
import auditRoutes from './routes/audit.routes.js';
import lighthouseRoutes from './routes/lighthouse.routes.js';
import screenshotRoutes from './routes/screenshot.routes.js';
const app = express();
const PORT = process.env.PORT || 8080;
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/audit', auditRoutes);
app.use('/lighthouse', lighthouseRoutes);
app.use('/screenshot', screenshotRoutes);
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'scan-service' });
});
app.listen(PORT, () => {
    console.log(`🚀 Scan Service running on port ${PORT}`);
});
export default app;
//# sourceMappingURL=index.js.map