/**
 * Chrome crash recovery utilities
 */

import { PuppeteerConfig } from './puppeteer-config.js';

export interface ScreenshotOptions {
  url: string;
  width?: number;
  height?: number;
  timeout?: number;
  retries?: number;
}

export class CrashRecovery {
  /**
   * Attempt screenshot with multiple fallback strategies
   */
  static async takeScreenshotWithRecovery(
    puppeteer: any, 
    options: ScreenshotOptions
  ): Promise<Buffer | null> {
    const { url, width = 1280, height = 800, timeout = 30000, retries = 3 } = options;
    
    // Strategy 1: Normal screenshot
    try {
      console.log(`📸 Attempting normal screenshot for: ${url}`);
      return await this.normalScreenshot(puppeteer, url, width, height, timeout);
    } catch (error) {
      console.log(`❌ Normal screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Strategy 2: Minimal browser mode
    try {
      console.log(`📸 Attempting minimal browser screenshot for: ${url}`);
      return await this.minimalScreenshot(puppeteer, url, width, height, timeout);
    } catch (error) {
      console.log(`❌ Minimal screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Strategy 3: Different Chrome binary (if available)
    try {
      console.log(`📸 Attempting with different Chrome binary for: ${url}`);
      return await this.alternativeChrome(puppeteer, url, width, height, timeout);
    } catch (error) {
      console.log(`❌ Alternative Chrome failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`💀 All screenshot strategies failed for: ${url}`);
    return null;
  }

  /**
   * Normal screenshot with current config
   */
  private static async normalScreenshot(
    puppeteer: any, 
    url: string, 
    width: number, 
    height: number, 
    timeout: number
  ): Promise<Buffer> {
    const config = await PuppeteerConfig.getLaunchOptions();
    const browser = await puppeteer.launch(config);
    
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      
      // Block problematic resources
      await page.setRequestInterception(true);
      page.on('request', (req: any) => {
        const url = req.url();
        if (url.includes('openstreetmap') || 
            url.includes('mapbox') || 
            url.includes('leaflet') ||
            url.includes('/tiles/')) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      await page.goto(url, { waitUntil: 'networkidle0', timeout });
      return await page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
    } finally {
      await browser.close();
    }
  }

  /**
   * Minimal screenshot with ultra-safe flags
   */
  private static async minimalScreenshot(
    puppeteer: any, 
    url: string, 
    width: number, 
    height: number, 
    timeout: number
  ): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      pipe: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-plugins'
      ]
    });
    
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout / 2 });
      return await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
    } finally {
      await browser.close();
    }
  }

  /**
   * Use system Chrome directly (fallback)
   */
  private static async alternativeChrome(
    puppeteer: any, 
    url: string, 
    width: number, 
    height: number, 
    timeout: number
  ): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome-stable', // Force system Chrome
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout / 3 });
      return await page.screenshot({ type: 'jpeg', quality: 50, fullPage: false });
    } finally {
      await browser.close();
    }
  }
}
