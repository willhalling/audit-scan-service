import { Router, Request, Response } from 'express';
import { MozService } from '../services/moz.service.js';
import { MozIntegrationService } from '../services/moz-integration.service.js';
import { firebaseService } from '../services/firebase.service.js';

const router = Router();

/**
 * GET /moz/metrics?url=example.com
 * Get MOZ metrics for a single URL
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        error: 'URL parameter is required',
        example: '/moz/metrics?url=example.com'
      });
      return;
    }

    console.log(`📊 MOZ metrics request for: ${url}`);

    if (!MozService.isConfigured()) {
      res.status(503).json({
        error: 'MOZ API not configured',
        message: 'MOZ_ACCESS_ID and MOZ_SECRET_KEY environment variables are required'
      });
      return;
    }

    const metrics = await MozService.getUrlMetrics(url);

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ metrics route error:', error);
    res.status(500).json({
      error: 'Failed to fetch MOZ metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /moz/bulk-metrics
 * Get MOZ metrics for multiple URLs
 * Body: { urls: string[] }
 */
router.post('/bulk-metrics', async (req: Request, res: Response) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({
        error: 'URLs array is required',
        example: { urls: ['example.com', 'google.com'] }
      });
      return;
    }

    if (urls.length > 100) {
      res.status(400).json({
        error: 'Too many URLs',
        message: 'Maximum 100 URLs allowed per request'
      });
      return;
    }

    console.log(`📊 MOZ bulk metrics request for ${urls.length} URLs`);

    if (!MozService.isConfigured()) {
      res.status(503).json({
        error: 'MOZ API not configured',
        message: 'MOZ_ACCESS_ID and MOZ_SECRET_KEY environment variables are required'
      });
      return;
    }

    const metrics = await MozService.getBulkUrlMetrics(urls);

    res.json({
      success: true,
      data: metrics,
      count: metrics.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ bulk metrics route error:', error);
    res.status(500).json({
      error: 'Failed to fetch bulk MOZ metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /moz/status
 * Check MOZ API configuration and connectivity
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const enabled = MozService.isEnabled();
    const configured = MozService.isConfigured();
    
    if (!enabled) {
      res.json({
        enabled: false,
        configured,
        message: 'MOZ API is disabled. Set MOZ_ENABLED=true to enable.',
        requiredEnvVars: ['MOZ_ENABLED=true', 'MOZ_ACCESS_ID', 'MOZ_SECRET_KEY']
      });
      return;
    }
    
    if (!configured) {
      res.json({
        enabled: true,
        configured: false,
        message: 'MOZ API credentials not configured',
        requiredEnvVars: ['MOZ_ACCESS_ID', 'MOZ_SECRET_KEY']
      });
      return;
    }

    console.log('🔍 Testing MOZ API connectivity...');
    const connectionTest = await MozService.testConnection();

    res.json({
      enabled: true,
      configured: true,
      connected: connectionTest.success,
      message: connectionTest.message,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ status route error:', error);
    res.status(500).json({
      enabled: MozService.isEnabled(),
      configured: MozService.isConfigured(),
      connected: false,
      error: 'Failed to test MOZ API connection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /moz/keywords?domain=example.com&keywords=seo,marketing
 * Get keyword research data for a domain
 */
router.get('/keywords', async (req: Request, res: Response) => {
  try {
    const { domain, keywords } = req.query;

    if (!domain || typeof domain !== 'string') {
      res.status(400).json({
        error: 'Domain parameter is required',
        example: '/moz/keywords?domain=example.com&keywords=seo,marketing'
      });
      return;
    }

    console.log(`📊 MOZ keyword research request for: ${domain}`);

    if (!MozService.isEnabled()) {
      res.status(503).json({
        error: 'MOZ API is disabled',
        message: 'Set MOZ_ENABLED=true to enable MOZ API'
      });
      return;
    }

    if (!MozService.isConfigured()) {
      res.status(503).json({
        error: 'MOZ API not configured',
        message: 'MOZ_ACCESS_ID and MOZ_SECRET_KEY environment variables are required'
      });
      return;
    }

    // Parse keywords if provided
    const keywordList = keywords && typeof keywords === 'string' 
      ? keywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
      : undefined;

    const keywordData = await MozService.getKeywordData(domain, keywordList);

    res.json({
      success: true,
      data: keywordData,
      count: keywordData.length,
      domain,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ keywords route error:', error);
    res.status(500).json({
      error: 'Failed to fetch MOZ keyword data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /moz/competitors?domain=example.com&limit=10
 * Get competitor analysis for a domain
 */
router.get('/competitors', async (req: Request, res: Response) => {
  try {
    const { domain, limit } = req.query;

    if (!domain || typeof domain !== 'string') {
      res.status(400).json({
        error: 'Domain parameter is required',
        example: '/moz/competitors?domain=example.com&limit=10'
      });
      return;
    }

    const limitNum = limit && typeof limit === 'string' ? parseInt(limit) : 10;
    if (limitNum > 50) {
      res.status(400).json({
        error: 'Limit cannot exceed 50',
        message: 'Maximum 50 competitors allowed per request'
      });
      return;
    }

    console.log(`📊 MOZ competitor analysis request for: ${domain}`);

    if (!MozService.isEnabled()) {
      res.status(503).json({
        error: 'MOZ API is disabled',
        message: 'Set MOZ_ENABLED=true to enable MOZ API'
      });
      return;
    }

    if (!MozService.isConfigured()) {
      res.status(503).json({
        error: 'MOZ API not configured',
        message: 'MOZ_ACCESS_ID and MOZ_SECRET_KEY environment variables are required'
      });
      return;
    }

    const competitorData = await MozService.getCompetitorData(domain, limitNum);

    res.json({
      success: true,
      data: competitorData,
      count: competitorData.length,
      domain,
      limit: limitNum,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ competitors route error:', error);
    res.status(500).json({
      error: 'Failed to fetch MOZ competitor data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /moz/analysis?url=example.com&keywords=true&competitors=true&limit=10
 * Get comprehensive MOZ analysis (metrics + keywords + competitors)
 */
router.get('/analysis', async (req: Request, res: Response) => {
  try {
    const { url, keywords, competitors, limit, keywordList } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        error: 'URL parameter is required',
        example: '/moz/analysis?url=example.com&keywords=true&competitors=true&limit=10'
      });
      return;
    }

    console.log(`📊 MOZ full analysis request for: ${url}`);

    if (!MozService.isEnabled()) {
      res.status(503).json({
        error: 'MOZ API is disabled',
        message: 'Set MOZ_ENABLED=true to enable MOZ API'
      });
      return;
    }

    if (!MozService.isConfigured()) {
      res.status(503).json({
        error: 'MOZ API not configured',
        message: 'MOZ_ACCESS_ID and MOZ_SECRET_KEY environment variables are required'
      });
      return;
    }

    // Parse options
    const includeKeywords = keywords === 'true' || keywords === '1';
    const includeCompetitors = competitors === 'true' || competitors === '1';
    const competitorLimit = limit && typeof limit === 'string' ? parseInt(limit) : 10;
    
    const keywordArray = keywordList && typeof keywordList === 'string' 
      ? keywordList.split(',').map(k => k.trim()).filter(k => k.length > 0)
      : undefined;

    const options: Record<string, unknown> = {
      includeKeywords,
      includeCompetitors,
      competitorLimit
    };
    
    if (keywordArray && keywordArray.length > 0) {
      options.keywords = keywordArray;
    }

    const analysisResult = await MozService.getFullAnalysis(url, options);

    res.json({
      success: true,
      data: analysisResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ analysis route error:', error);
    res.status(500).json({
      error: 'Failed to fetch MOZ analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /moz/analyze-and-save
 * Analyze a URL with MOZ and save to Firestore
 * Body: { url: string, auditId?: string, includeKeywords?: boolean, includeCompetitors?: boolean }
 */
router.post('/analyze-and-save', async (req: Request, res: Response) => {
  try {
    const { url, auditId, includeKeywords = true, includeCompetitors = true, keywords, competitorLimit = 10 } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        error: 'URL is required',
        example: { url: 'example.com', auditId: 'audit_123', includeKeywords: true }
      });
      return;
    }

    console.log(`📊 MOZ analyze and save request for: ${url}`);

    if (!MozService.isEnabled()) {
      res.status(503).json({
        error: 'MOZ API is disabled',
        message: 'Set MOZ_ENABLED=true to enable MOZ API'
      });
      return;
    }

    const keywordArray = Array.isArray(keywords) ? keywords : undefined;

    const options: Record<string, unknown> = {
      auditId,
      saveToFirestore: !!auditId,
      includeKeywords,
      includeCompetitors,
      competitorLimit
    };
    
    if (keywordArray && keywordArray.length > 0) {
      options.keywords = keywordArray;
    }

    const result = await MozIntegrationService.analyzePage(url, options);

    res.json({
      success: true,
      data: result,
      savedToFirestore: !!auditId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ analyze and save route error:', error);
    res.status(500).json({
      error: 'Failed to analyze and save MOZ data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /moz/enhance-audit
 * Add MOZ data to all pages in an existing audit
 * Body: { auditId: string }
 */
router.post('/enhance-audit', async (req: Request, res: Response) => {
  try {
    const { auditId } = req.body;

    if (!auditId || typeof auditId !== 'string') {
      res.status(400).json({
        error: 'auditId is required',
        example: { auditId: 'audit_123' }
      });
      return;
    }

    console.log(`📊 MOZ enhance audit request for: ${auditId}`);

    if (!MozService.isEnabled()) {
      res.status(503).json({
        error: 'MOZ API is disabled',
        message: 'Set MOZ_ENABLED=true to enable MOZ API'
      });
      return;
    }

    const result = await MozIntegrationService.enhanceAuditWithMozData(auditId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        processedUrls: result.processedUrls,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        processedUrls: result.processedUrls
      });
    }

  } catch (error) {
    console.error('❌ MOZ enhance audit route error:', error);
    res.status(500).json({
      error: 'Failed to enhance audit with MOZ data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /moz/audit-summary/:auditId
 * Get MOZ data summary for an audit
 */
router.get('/audit-summary/:auditId', async (req: Request, res: Response) => {
  try {
    const { auditId } = req.params;

    if (!auditId) {
      res.status(400).json({
        error: 'auditId parameter is required',
        example: '/moz/audit-summary/audit_123'
      });
      return;
    }

    console.log(`📊 MOZ audit summary request for: ${auditId}`);

    const summary = await MozIntegrationService.getAuditMozSummary(auditId);

    res.json({
      success: true,
      data: summary,
      auditId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ audit summary route error:', error);
    res.status(500).json({
      error: 'Failed to get MOZ audit summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /moz/firestore/:auditId/:pageUrl
 * Get saved MOZ data for a specific page
 */
router.get('/firestore/:auditId/:pageUrl', async (req: Request, res: Response) => {
  try {
    const { auditId, pageUrl } = req.params;

    if (!auditId || !pageUrl) {
      res.status(400).json({
        error: 'auditId and pageUrl parameters are required',
        example: '/moz/firestore/audit_123/example.com'
      });
      return;
    }

    // Decode URL if it was encoded
    const decodedUrl = decodeURIComponent(pageUrl);
    console.log(`📊 MOZ firestore data request for: ${decodedUrl} in audit ${auditId}`);

    const mozData = await firebaseService.getMozDataForPage(auditId, decodedUrl);

    if (!mozData) {
      res.status(404).json({
        error: 'MOZ data not found',
        message: `No MOZ data found for ${decodedUrl} in audit ${auditId}`
      });
      return;
    }

    res.json({
      success: true,
      data: mozData,
      auditId,
      pageUrl: decodedUrl,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MOZ firestore data route error:', error);
    res.status(500).json({
      error: 'Failed to get MOZ data from Firestore',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
