import { Router, Request, Response } from 'express';
import { AuditService } from '../services/audit.service.js';
import { normalizeUrl, isValidUrl } from '../utils/helpers.js';

const router = Router();

// Start a new audit
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { url, pages, authorUid, enableAI, auditId } = req.body;

    // Debug logs for enableAI
    console.log('🔍 POST enableAI value:', enableAI);
    console.log('🔍 POST enableAI type:', typeof enableAI);

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!auditId) {
      return res.status(400).json({ error: 'auditId is required' });
    }

    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const auditRequest: any = {
      url: normalizedUrl,
      auditId: auditId
    };

    if (pages) {
      auditRequest.pages = pages;
    }

    if (authorUid) {
      auditRequest.authorUid = authorUid;
    }

    if (typeof enableAI === 'boolean') {
      auditRequest.enableAI = enableAI;
    }

    const result = await AuditService.startAudit(auditRequest);

    if (result.error) {
      return res.status(400).json({ 
        error: result.error,
        url: normalizedUrl
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('❌ Audit start error:', error);
    return res.status(500).json({ 
      error: 'Failed to start audit',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start a new audit (GET with query params)
router.get('/start', async (req: Request, res: Response) => {
  try {
    const { url, pages, authorUid, enableAI } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const auditRequest: any = {
      url: normalizedUrl
    };

    if (typeof pages === 'string') {
      auditRequest.pages = pages.split(',');
    }

    if (typeof authorUid === 'string') {
      auditRequest.authorUid = authorUid;
    }

    if (typeof enableAI === 'string') {
      auditRequest.enableAI = enableAI.toLowerCase() === 'true';
    }

    const result = await AuditService.startAudit(auditRequest);

    if (result.error) {
      return res.status(400).json({ 
        error: result.error,
        url: normalizedUrl
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('❌ Audit start error:', error);
    return res.status(500).json({ 
      error: 'Failed to start audit',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get audit status
router.get('/:auditId', async (req: Request, res: Response) => {
  try {
    const { auditId } = req.params;

    if (!auditId) {
      return res.status(400).json({ error: 'Audit ID is required' });
    }

    const audit = await AuditService.getAuditStatus(auditId);

    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    return res.json(audit);
  } catch (error) {
    console.error('❌ Audit status error:', error);
    return res.status(500).json({ 
      error: 'Failed to get audit status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Download audit as JSON
router.get('/:auditId/download', async (req: Request, res: Response) => {
  try {
    const { auditId } = req.params;

    if (!auditId) {
      return res.status(400).json({ error: 'Audit ID is required' });
    }

    const audit = await AuditService.getAuditStatus(auditId);

    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${auditId}.json"`);
    
    return res.json(audit);
  } catch (error) {
    console.error('❌ Audit download error:', error);
    return res.status(500).json({ 
      error: 'Failed to download audit',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
