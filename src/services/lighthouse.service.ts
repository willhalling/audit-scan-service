import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { LighthouseConfig, LighthouseResult } from '../types/index.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';

export class LighthouseService {
  private static queue: Array<() => Promise<any>> = [];
  private static isProcessing = false;
  private static activeChrome: any = null; // Track active Chrome instance
  private static processingUrl: string | null = null; // Track what's being processed
  private static readonly DESKTOP_CONFIG = {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'desktop' as const,
      throttling: { rttMs: 0, throughputKbps: 0, cpuSlowdownMultiplier: 1 },
      throttlingMethod: 'provided' as const,
      screenEmulation: { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false },
      emulatedUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
    }
  };

  private static readonly MOBILE_CONFIG = {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'mobile' as const,
      throttling: { rttMs: 0, throughputKbps: 0, cpuSlowdownMultiplier: 1 },
      throttlingMethod: 'provided' as const,
      screenEmulation: { width: 412, height: 823, deviceScaleFactor: 2.625, mobile: true },
      emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36'
    }
  };

  private static async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      console.log(`🔄 Queue status: processing=${this.isProcessing}, queue length=${this.queue.length}`);
      return;
    }

    this.isProcessing = true;
    console.log(`🚀 Starting Lighthouse queue processing, ${this.queue.length} tasks in queue`);
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error('❌ Task in Lighthouse queue failed:', error);
        }
        // Add a small delay between tasks to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    this.isProcessing = false;
    this.processingUrl = null;
    console.log(`✅ Lighthouse queue processing complete`);
  }

  private static queueLighthouse<T>(task: () => Promise<T>): Promise<T> {
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

  static async runLighthouse(config: LighthouseConfig): Promise<LighthouseResult> {
    return this.queueLighthouse(async () => {
      // Check if there's already a Chrome instance running
      if (this.activeChrome) {
        console.log('⚠️ Cleaning up existing Chrome instance before starting new Lighthouse scan...');
        try {
          await this.activeChrome.kill();
        } catch (error) {
          console.log('⚠️ Error killing existing Chrome:', error);
        }
        this.activeChrome = null;
      }

      let chrome: any = null;
      this.processingUrl = config.url;
      
      try {
        console.log(`🚀 Starting Lighthouse for: ${config.url}`);
        
        // Get the Chrome path from PuppeteerConfig (with smart detection)
        const chromePath = await PuppeteerConfig.getChromePath();
        console.log(`🎯 Using Chrome path for Lighthouse: ${chromePath}`);
        
        chrome = await chromeLauncher.launch({ 
          chromeFlags: [
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-zygote',
            // Remove --single-process for Lighthouse compatibility
            '--disable-features=VizDisplayCompositor,HttpsFirstBalancedModeAutoEnable',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-extensions',
            '--disable-default-apps',
            '--no-first-run',
            '--disable-notifications'
            // Note: Removed --disable-web-security and other aggressive flags that break Lighthouse
          ],
          chromePath: chromePath,
          startingUrl: 'about:blank',
          handleSIGINT: false,
          logLevel: 'error'
        });
        
        this.activeChrome = chrome; // Track the active instance
        console.log(`✅ Chrome launched successfully on port ${chrome.port}`);
        
        const options = {
          logLevel: 'error' as const,
          output: 'json' as const,
          onlyCategories: config.categories || ['performance', 'accessibility', 'best-practices', 'seo'],
          port: chrome.port,
          settings: {
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            skipAudits: ['unused-javascript', 'unused-css-rules'],
            disableStorageReset: true,
            maxWaitForFcp: 30000,
            maxWaitForLoad: 45000
          }
        };

        const lighthouseConfig = config.useDesktop ? this.DESKTOP_CONFIG : this.MOBILE_CONFIG;
        const runnerResult = await lighthouse(config.url, options, lighthouseConfig);
        
        if (!runnerResult?.lhr) {
          throw new Error('Lighthouse failed to generate report');
        }

        // Extract only essential audit data (no screenshots, traces, or raw content)
        const essentialAudits: any = {};
        const importantAuditKeys = [
          'first-contentful-paint',
          'largest-contentful-paint', 
          'cumulative-layout-shift',
          'speed-index',
          'total-blocking-time',
          'interactive',
          'color-contrast',
          'heading-order',
          'image-alt',
          'link-name',
          'meta-description',
          'title',
          'robots-txt'
        ];

        for (const key of importantAuditKeys) {
          if (runnerResult.lhr.audits[key]) {
            const audit = runnerResult.lhr.audits[key];
            essentialAudits[key] = {
              id: audit.id,
              title: audit.title,
              description: audit.description,
              score: audit.score,
              scoreDisplayMode: audit.scoreDisplayMode,
              displayValue: audit.displayValue,
              numericValue: audit.numericValue,
              numericUnit: audit.numericUnit
              // Deliberately exclude: details, explanation, errorMessage (can be large)
            };
          }
        }

        return {
          url: config.url,
          timestamp: new Date().toISOString(),
          categories: runnerResult.lhr.categories,
          audits: essentialAudits, // Only essential audit data
          lighthouseVersion: runnerResult.lhr.lighthouseVersion,
          userAgent: runnerResult.lhr.userAgent
        };
      } catch (lighthouseError) {
        console.error('❌ Lighthouse execution failed:', lighthouseError);
        throw lighthouseError;
      } finally {
        if (chrome) {
          console.log('🔄 Killing Chrome process...');
          try {
            await chrome.kill();
            console.log('✅ Chrome process killed successfully');
          } catch (killError) {
            console.error('⚠️ Error killing Chrome process:', killError);
          }
        }
        
        // Clear tracking variables
        this.activeChrome = null;
        this.processingUrl = null;
        
        // Force garbage collection of Chrome processes if any are left
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    });
  }

  static async getLighthouseSummary(config: LighthouseConfig) {
    const result = await this.runLighthouse(config);
    
    return {
      url: result.url,
      timestamp: result.timestamp,
      performance: Math.round((result.categories.performance?.score || 0) * 100),
      accessibility: Math.round((result.categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((result.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((result.categories.seo?.score || 0) * 100),
      categories: result.categories,
      audits: result.audits
    };
  }

  static isRunning(): boolean {
    return this.isProcessing;
  }

  static getCurrentProcessingUrl(): string | null {
    return this.processingUrl;
  }

  static getQueueLength(): number {
    return this.queue.length;
  }
}
