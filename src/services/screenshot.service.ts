import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { ScreenshotOptions, PageScreenshots } from '../types/index.js';
import { StorageService } from './storage.service.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
import { hideElementsForScreenshot, waitForPageReady, blockAggressiveMapResources } from '../utils/screenshot-helpers.js';

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
    console.log(`📸 Starting screenshot for: ${options.url}`);
    
    // Strategy 1: Normal screenshot attempt
    try {
      console.log(`🔄 Attempting normal screenshot...`);
      return await this.attemptNormalScreenshot(options);
    } catch (error) {
      console.log(`❌ Normal screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Strategy 2: Aggressive map-blocking screenshot
    try {
      console.log(`🛡️ Attempting aggressive map-blocking screenshot...`);
      return await this.attemptAggressiveScreenshot(options);
    } catch (error) {
      console.error(`❌ All screenshot strategies failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error('Screenshot generation completely failed');
    }
  }

  private static async attemptNormalScreenshot(options: ScreenshotOptions): Promise<Buffer> {
    await PuppeteerConfig.forceCleanup();
    const config = await PuppeteerConfig.getLaunchOptions();
    
    console.log(`🚀 Launching browser for normal screenshot...`);
    const browser = await puppeteer.launch(config);

    try {
      const page = await browser.newPage();
      
      if (options.viewport) {
        await page.setViewport(options.viewport);
      }

      console.log(`🌐 Navigating to: ${options.url}`);
      await page.goto(options.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Hide elements before screenshot
      await hideElementsForScreenshot(page, options.hideSelectors);
      await waitForPageReady(page);

      console.log(`📸 Taking normal screenshot...`);
      const screenshot = await page.screenshot({
        fullPage: options.fullPage || false,
        type: 'png'
      });

      return screenshot as Buffer;
    } finally {
      await browser.close();
    }
  }

  private static async attemptAggressiveScreenshot(options: ScreenshotOptions): Promise<Buffer> {
    await PuppeteerConfig.forceCleanup();
    const config = await PuppeteerConfig.getLaunchOptions();
    
    console.log(`� Launching browser for aggressive screenshot...`);
    const browser = await puppeteer.launch(config);

    try {
      const page = await browser.newPage();
      
      if (options.viewport) {
        await page.setViewport(options.viewport);
      }

      // AGGRESSIVE: Block all map resources before navigation
      await blockAggressiveMapResources(page);

      console.log(`🌐 Navigating to: ${options.url} (with aggressive blocking)`);
      await page.goto(options.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 25000 // Shorter timeout for aggressive mode
      });

      // Hide elements and map containers
      const mapSelectors = [
        '[id*="map"]',
        '[class*="map"]', 
        '.leaflet-container',
        '.mapboxgl-map',
        '.google-map',
        'iframe[src*="maps"]',
        '.osm-map',
        '#map',
        '.map'
      ];
      
      await hideElementsForScreenshot(page, [...(options.hideSelectors || []), ...mapSelectors]);
      
      // Shorter wait for aggressive mode
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`📸 Taking aggressive screenshot...`);
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
      fullPage: false
      // Temporarily removed hideSelectors to test if this is causing the hang
      // hideSelectors: ['#CybotCookiebotDialog'] // Hide cookie dialog by default
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
