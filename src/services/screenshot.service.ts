import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { ScreenshotOptions, PageScreenshots } from '../types/index.js';
import { StorageService } from './storage.service.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';

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
    // Add a hard timeout to prevent indefinite hanging
    const timeoutPromise = new Promise<Buffer>((_, reject) => {
      setTimeout(() => reject(new Error('Screenshot timeout after 90 seconds')), 90000);
    });

    const screenshotPromise = this.attemptScreenshot(options);
    
    try {
      return await Promise.race([screenshotPromise, timeoutPromise]);
    } catch (error) {
      console.error('❌ Screenshot failed with timeout or error:', error);
      throw error;
    }
  }

  private static async attemptScreenshot(options: ScreenshotOptions): Promise<Buffer> {
    // Clean up any leftover browser processes first
    await PuppeteerConfig.forceCleanup();
    
    // Get the single, simplified configuration
    const config = await PuppeteerConfig.getLaunchOptions();
    
    console.log(`📸 Taking screenshot with simplified config`);
    console.log(`🔧 Config: executablePath=${config.executablePath}, args=${JSON.stringify(config.args)}`);
    
    const launchStartTime = Date.now();
    console.log(`🚀 Launching browser...`);
    const browser = await puppeteer.launch(config);
    console.log(`✅ Browser launched in ${Date.now() - launchStartTime}ms`);

    try {
      const pageStartTime = Date.now();
      console.log(`📄 Creating new page...`);
      const page = await browser.newPage();
      console.log(`✅ New page created in ${Date.now() - pageStartTime}ms`);
      
      if (options.viewport) {
        console.log(`📐 Setting viewport: ${JSON.stringify(options.viewport)}`);
        await page.setViewport(options.viewport);
      } else {
        console.log(`📐 Using default viewport`);
      }

      console.log(`🌐 Navigating to: ${options.url}`);
      const navStartTime = Date.now();
      await page.goto(options.url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 // Increased to match browser launch timeout
      });
      console.log(`✅ Page loaded in ${Date.now() - navStartTime}ms`);

      // Hide elements before screenshot if specified
      if (options.hideSelectors && options.hideSelectors.length > 0) {
        await page.evaluate((selectors: string[]) => {
          selectors.forEach((selector: string) => {
            const el = document.querySelector(selector);
            if (el) {
              (el as HTMLElement).style.display = 'none';
            }
          });
        }, options.hideSelectors);
      }

      console.log(`📸 Taking screenshot...`);
      const screenshotStartTime = Date.now();
      const screenshot = await page.screenshot({
        fullPage: options.fullPage || false,
        type: 'png'
      });
      console.log(`✅ Screenshot captured in ${Date.now() - screenshotStartTime}ms`);

      return screenshot as Buffer;
    } finally {
      // Ensure browser is properly closed
      try {
        console.log('🔄 Closing browser...');
        await browser.close();
        console.log('✅ Browser closed successfully');
      } catch (closeError) {
        console.warn('⚠️ Error closing browser:', closeError);
        // Force cleanup if normal close fails
        await PuppeteerConfig.forceCleanup();
      }
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
