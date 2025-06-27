import puppeteer from 'puppeteer';
import { ScreenshotOptions, PageScreenshots } from '../types/index.js';
import { StorageService } from './storage.service.js';

export class ScreenshotService {
  // Screenshot dimensions for different use cases
  static readonly DIMENSIONS = {
    DESKTOP: { width: 1920, height: 1080 },
    MOBILE: { width: 375, height: 667 },
    DESKTOP_ACCESSIBILITY: { width: 545, height: 500 },
    MOBILE_ACCESSIBILITY: { width: 298, height: 742 }, // Fixed decimal to integer
    COVER_PAGE: { width: 1920, height: 1080 } // Will be scaled to 27% in PDF
  };

  static async takeScreenshot(options: ScreenshotOptions): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage();
      
      if (options.viewport) {
        await page.setViewport(options.viewport);
      } else {
        await page.setViewport({ width: 1280, height: 720 });
      }

      await page.goto(options.url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Hide elements before screenshot if specified
      if (options.hideSelectors && options.hideSelectors.length > 0) {
        await page.evaluate((selectors) => {
          selectors.forEach((selector) => {
            const el = document.querySelector(selector);
            if (el) {
              (el as HTMLElement).style.display = 'none';
            }
          });
        }, options.hideSelectors);
      }

      const screenshot = await page.screenshot({
        fullPage: options.fullPage || false,
        type: 'png'
      });

      return screenshot as Buffer;
    } finally {
      await browser.close();
    }
  }

  static async takeAndUploadScreenshots(
    url: string, 
    auditId: string, 
    host: string
  ): Promise<PageScreenshots> {
    console.log(`📸 Taking cover page screenshot for ${url}`);
    
    // Cover page screenshot - 1366x850 for desktop
    const coverScreenshot = await this.takeScreenshot({
      url,
      viewport: { width: 1366, height: 850 }, // Updated size for desktop screenshot
      fullPage: false,
      hideSelectors: ['#CybotCookiebotDialog'] // Hide cookie dialog by default
    });

    const desktopUrl = await StorageService.uploadScreenshot(
      coverScreenshot, 
      auditId, 
      'desktop', // This is the cover page screenshot
      host
    );

    console.log(`✅ Cover page screenshot uploaded: ${desktopUrl}`);
    
    return {
      desktopUrl // Only return cover page screenshot
    };
  }
}
