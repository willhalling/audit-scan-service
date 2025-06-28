import puppeteer from 'puppeteer-core';
import { ScreenshotOptions, PageScreenshots } from '../types/index.js';
import { StorageService } from './storage.service.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';

export class ScreenshotService {
  private static queue: Array<() => Promise<any>> = [];
  private static isProcessing = false;
  
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
      setTimeout(() => reject(new Error('Screenshot timeout after 45 seconds')), 45000);
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
    let lastError: Error | null = null;
    
    // Clean up any leftover browser processes first
    await PuppeteerConfig.forceCleanupBrowsers();
    
    // Try main configuration first, then alternative if it fails
    const configurations = [
      await PuppeteerConfig.getLaunchOptions(),
      await PuppeteerConfig.getAlternativeLaunchOptions()
    ];
    
    for (let i = 0; i < configurations.length; i++) {
      try {
        console.log(`📸 Attempting screenshot with config ${i + 1}/${configurations.length}`);
        console.log(`🔧 Config: executablePath=${configurations[i].executablePath}, args=${JSON.stringify(configurations[i].args)}`);
        
        const launchStartTime = Date.now();
        console.log(`🚀 Launching browser...`);
        const browser = await puppeteer.launch(configurations[i]);
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
            timeout: 30000 
          });
          console.log(`✅ Page loaded in ${Date.now() - navStartTime}ms`);

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
            await PuppeteerConfig.forceCleanupBrowsers();
          }
        }
      } catch (error) {
        console.error(`❌ Screenshot attempt ${i + 1} failed:`, error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // If this is the last configuration, throw the error
        if (i === configurations.length - 1) {
          throw lastError;
        }
        
        // Wait a bit before trying the next configuration
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // This shouldn't be reached, but just in case
    throw lastError || new Error('All screenshot attempts failed');
  }

  private static async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`📋 Processing screenshot queue (${this.queue.length} items)`);
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error('❌ Queue task failed:', error);
        }
      }
    }
    this.isProcessing = false;
  }

  private static queueScreenshot<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
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
