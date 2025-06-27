import { Router, Request, Response } from 'express';
import { ScreenshotService } from '../services/screenshot.service.js';
import { normalizeUrl, isValidUrl } from '../utils/helpers.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { url, fullPage = 'false', width = '1280', height = '720' } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const screenshot = await ScreenshotService.takeScreenshot({
      url: normalizedUrl,
      fullPage: fullPage === 'true',
      viewport: {
        width: parseInt(width as string) || 1280,
        height: parseInt(height as string) || 720
      }
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': screenshot.length.toString()
    });
    
    return res.end(screenshot);
  } catch (error) {
    console.error('❌ Screenshot error:', error);
    return res.status(500).json({ 
      error: 'Screenshot generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
