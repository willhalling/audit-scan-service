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
      
      // Add timeout to waitForPageReady to prevent hanging
      console.log(`⏱️ Waiting for page to be ready...`);
      const waitPromise = waitForPageReady(page, 1000); // Reduced wait time
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('waitForPageReady timeout')), 8000)
      );
      
      try {
        await Promise.race([waitPromise, timeoutPromise]);
      } catch (error) {
        console.log(`⚠️ Page ready wait timed out, proceeding with screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      console.log(`📸 Taking normal screenshot...`);
      
      // Add much more aggressive timeout to screenshot operation
      console.log(`📸 Starting screenshot capture with 10 second timeout...`);
      const screenshotPromise = page.screenshot({
        fullPage: options.fullPage || false,
        type: 'png'
      });
      const screenshotTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => {
          console.error('📸 SCREENSHOT TIMEOUT - Screenshot operation hanging after 10 seconds');
          reject(new Error('Screenshot timeout after 10 seconds'));
        }, 10000) // Reduced from 15 to 10 seconds
      );
      
      console.log(`📸 Racing screenshot vs timeout...`);
      const screenshot = await Promise.race([screenshotPromise, screenshotTimeoutPromise]);
      console.log(`📸 Screenshot completed successfully`);

      return screenshot as Buffer;
    } finally {
      console.log(`🔒 Closing screenshot browser...`);
      try {
        await Promise.race([
          browser.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), 5000))
        ]);
        console.log(`✅ Screenshot browser closed successfully`);
      } catch (closeError) {
        console.warn(`⚠️ Screenshot browser close failed, force killing:`, closeError);
        try {
          if (browser.process()) {
            browser.process()?.kill('SIGKILL');
            console.log(`💀 Screenshot browser process killed`);
          }
        } catch (killError) {
          console.warn(`⚠️ Failed to kill screenshot browser process:`, killError);
        }
      }
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
      
      // Shorter wait for aggressive mode
      await new Promise(resolve => setTimeout(resolve, 1500)); // Reduced from 2000

      await hideElementsForScreenshot(page, [...(options.hideSelectors || []), ...mapSelectors]);
      
      console.log(`📸 Taking aggressive screenshot...`);
      
      // Add timeout to aggressive screenshot with better logging
      console.log(`📸 Starting aggressive screenshot capture with 10 second timeout...`);
      const screenshotPromise = page.screenshot({
        fullPage: options.fullPage || false,
        type: 'png'
      });
      const screenshotTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => {
          console.error('📸 AGGRESSIVE SCREENSHOT TIMEOUT - Screenshot operation hanging after 10 seconds');
          reject(new Error('Aggressive screenshot timeout after 10 seconds'));
        }, 10000) // Reduced from 12 to 10 seconds
      );
      
      console.log(`📸 Racing aggressive screenshot vs timeout...`);
      const screenshot = await Promise.race([screenshotPromise, screenshotTimeoutPromise]);
      console.log(`📸 Aggressive screenshot completed successfully`);

      return screenshot as Buffer;
    } finally {
      console.log(`🔒 Closing aggressive screenshot browser...`);
      try {
        await Promise.race([
          browser.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), 5000))
        ]);
        console.log(`✅ Aggressive screenshot browser closed successfully`);
      } catch (closeError) {
        console.warn(`⚠️ Aggressive screenshot browser close failed, force killing:`, closeError);
        try {
          if (browser.process()) {
            browser.process()?.kill('SIGKILL');
            console.log(`💀 Aggressive screenshot browser process killed`);
          }
        } catch (killError) {
          console.warn(`⚠️ Failed to kill aggressive screenshot browser process:`, killError);
        }
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

  /**
   * Capture plain desktop and mobile screenshots of a page and upload them to
   * Firebase Storage. Used by the lightweight audit flow (no annotations).
   */
  static async takePlainScreenshots(
    url: string,
    auditId: string,
    host: string
  ): Promise<{ desktopUrl: string; mobileUrl: string }> {
    console.log(`📸 Taking plain screenshots for ${url}`);

    const [desktopBuffer, mobileBuffer] = await Promise.all([
      this.takeScreenshot({
        url,
        viewport: { width: 1366, height: 850 },
        fullPage: false
      }),
      this.takeScreenshot({
        url,
        viewport: { width: 375, height: 667 },
        fullPage: false
      })
    ]);

    const [desktopUrl, mobileUrl] = await Promise.all([
      StorageService.uploadScreenshot(desktopBuffer, auditId, 'desktop', host),
      StorageService.uploadScreenshot(mobileBuffer, auditId, 'mobile', host)
    ]);

    console.log(`✅ Plain screenshots uploaded: desktop=${desktopUrl}, mobile=${mobileUrl}`);
    return { desktopUrl, mobileUrl };
  }
}
