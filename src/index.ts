import dotenv from 'dotenv';
dotenv.config();
console.log('FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT ? 'Loaded' : 'NOT loaded');

import express from 'express';
import cors from 'cors';
import auditRoutes from './routes/audit.routes.js';
import lighthouseRoutes from './routes/lighthouse.routes.js';
import screenshotRoutes from './routes/screenshot.routes.js';
import diagnosticRoutes from './routes/diagnostic.routes.js';
import { AuditService } from './services/audit.service.js';
import { LighthouseService } from './services/lighthouse.service.js';
import { ScreenshotService } from './services/screenshot.service.js';
import { normalizeUrl, isValidUrl } from './utils/helpers.js';

// Make sure we catch and handle all unhandled errors
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  console.log('⚠️ The application will continue running, but may be in an inconsistent state');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 8080;
const startTime = new Date();

console.log(`Starting scan-service on port ${PORT}, Node version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Register early health check before loading routes - helps with RunPod startup probes
app.get('/health', (req, res) => {
  const uptime = Math.round((Date.now() - startTime.getTime()) / 1000);
  res.json({ 
    status: 'ok', 
    service: 'scan-service',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${uptime} seconds`,
    startTime: startTime.toISOString(),
    port: PORT,
    nodeVersion: process.version,
    mockFirebase: process.env.USE_MOCK_FIREBASE === 'true',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT
    }
  });
});

console.log('Registering routes...');

// Routes - wrap in try/catch to prevent startup failures
try {
  app.use('/audit', auditRoutes);
  app.use('/lighthouse', lighthouseRoutes);
  app.use('/screenshot', screenshotRoutes);
  app.use('/diagnostic', diagnosticRoutes);
  console.log('Routes registered successfully');
} catch (error) {
  console.error('Error registering routes:', error);
  // We'll continue anyway to ensure the health check works
}

/**
 * RunPod Serverless compatibility endpoint.
 *
 * RunPod sends jobs as POST requests with a body shaped like:
 *   { "input": { "action": "startAudit", "url": "...", "auditId": "...", ... } }
 *
 * Because website audits can be long-running, the default `startAudit` action
 * starts the work in the background and immediately returns the auditId. The
 * caller can then poll GET /audit/:auditId (or check Firestore) for results.
 *
 * Supported actions:
 *   - startAudit   -> { auditId }
 *   - getAudit     -> full AuditResult (or 404)
 *   - lighthouse   -> LighthouseResult
 *   - screenshot   -> base64 PNG string
 */
async function handleRunPodJob(body: any) {
  const input = body?.input || body || {};
  const action = input.action || 'startAudit';

  // Warmup / health ping used by RunPod to keep a worker alive
  if (input.warmup || action === 'warmup') {
    return { status: 'warm' };
  }

  if (action === 'startAudit') {
    const { url, auditId, pages, authorUid, enableAI } = input;

    if (!url) {
      return { error: 'URL is required' };
    }
    if (!auditId) {
      return { error: 'auditId is required' };
    }

    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return { error: 'Invalid URL format', url };
    }

    const auditRequest: any = {
      url: normalizedUrl,
      auditId
    };

    if (pages) {
      auditRequest.pages = Array.isArray(pages) ? pages : [pages];
    }
    if (authorUid) {
      auditRequest.authorUid = authorUid;
    }
    if (typeof enableAI === 'boolean') {
      auditRequest.enableAI = enableAI;
    }

    const result = await AuditService.startAudit(auditRequest);
    if (result.error) {
      return { error: result.error, url: normalizedUrl };
    }
    return result;
  }

  if (action === 'getAudit') {
    const { auditId } = input;
    if (!auditId) {
      return { error: 'auditId is required' };
    }
    const audit = await AuditService.getAuditStatus(auditId);
    if (!audit) {
      return { error: 'Audit not found', auditId };
    }
    return audit;
  }

  if (action === 'lighthouse') {
    const { url, useDesktop = false, categories } = input;
    if (!url) {
      return { error: 'URL is required' };
    }
    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return { error: 'Invalid URL format', url };
    }
    return await LighthouseService.runLighthouse({
      url: normalizedUrl,
      useDesktop,
      categories
    });
  }

  if (action === 'screenshot') {
    const { url, fullPage = false, width = 1280, height = 720 } = input;
    if (!url) {
      return { error: 'URL is required' };
    }
    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return { error: 'Invalid URL format', url };
    }
    const screenshot = await ScreenshotService.takeScreenshot({
      url: normalizedUrl,
      fullPage,
      viewport: {
        width: parseInt(width as string) || 1280,
        height: parseInt(height as string) || 720
      }
    });
    return {
      imageBase64: screenshot.toString('base64'),
      contentType: 'image/png',
      size: screenshot.length
    };
  }

  return { error: `Unknown action: ${action}` };
}

app.post('/run', async (req, res) => {
  try {
    console.log('🔥 RunPod job received:', JSON.stringify(req.body));
    const result = await handleRunPodJob(req.body);
    return res.json(result);
  } catch (error) {
    console.error('❌ RunPod handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/runsync', async (req, res) => {
  try {
    console.log('🔥 RunPod sync job received:', JSON.stringify(req.body));
    const result = await handleRunPodJob(req.body);
    return res.json(result);
  } catch (error) {
    console.error('❌ RunPod sync handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error handler caught:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'Unknown error occurred'
  });
});

// Start server with proper error handling
let server: ReturnType<typeof app.listen>;

try {
  server = app.listen(PORT, () => {
    console.log(`🚀 Scan Service running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
    
    // Log server address info for debugging
    const addressInfo = server.address();
    console.log(`Server address info: ${typeof addressInfo === 'string' ? addressInfo : JSON.stringify(addressInfo)}`);
  });
  
  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`⛔️ Port ${PORT} is already in use. Please choose another port.`);
    } else {
      console.error('Server error:', error);
    }
    process.exit(1);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}

export default app;
