import { Router, Request, Response } from 'express';
import { LighthouseService } from '../services/lighthouse.service.js';
import { normalizeUrl, isValidUrl } from '../utils/helpers.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, useDesktop = false, categories } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const result = await LighthouseService.runLighthouse({
      url: normalizedUrl,
      useDesktop,
      categories
    });

    return res.json(result);
  } catch (error) {
    console.error('❌ Lighthouse error:', error);
    return res.status(500).json({ 
      error: 'Lighthouse analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { url, useDesktop } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const result = await LighthouseService.getLighthouseSummary({
      url: normalizedUrl,
      useDesktop: useDesktop === 'true'
    });

    return res.json(result);
  } catch (error) {
    console.error('❌ Lighthouse error:', error);
    return res.status(500).json({ 
      error: 'Lighthouse analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
