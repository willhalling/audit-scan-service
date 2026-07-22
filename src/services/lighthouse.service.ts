import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { LighthouseResult, LighthouseOptions, LighthouseOpportunity, ReducedLighthouseData } from '../types/index.js';
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

  // Extract the top performance opportunities from a raw Lighthouse result
  private static extractOpportunities(lhr: any): LighthouseOpportunity[] {
    const opportunities: LighthouseOpportunity[] = [];

    if (!lhr.audits) return opportunities;

    for (const [auditId, auditData] of Object.entries(lhr.audits as any)) {
      const audit = auditData as any;
      if (audit.score === null || audit.score === undefined || audit.score >= 1) continue;
      if (!audit.details || audit.details.overallSavingsMs === undefined) continue;

      const savingsMs = audit.details.overallSavingsMs as number;
      const severity: LighthouseOpportunity['severity'] =
        savingsMs >= 1000 ? 'high' : savingsMs >= 300 ? 'medium' : 'low';

      opportunities.push({
        issue: audit.title || auditId,
        suggestion: (audit.displayValue
          ? `${audit.displayValue} potential saving`
          : audit.description || 'See Lighthouse documentation for details'
        ).replace(/\s+/g, ' ').slice(0, 200),
        severity
      });
    }

    const severityRank = { high: 0, medium: 1, low: 2 };
    return opportunities
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, 8);
  }

  /**
   * Reduce a full LighthouseResult to the trimmed contract shape written to
   * Firestore (display strings + page-weight data + top opportunities).
   */
  static reduce(result: LighthouseResult): ReducedLighthouseData {
    const audits = result.audits || {};
    const display = (id: string): string =>
      audits[id]?.displayValue ||
      (audits[id]?.numericValue !== undefined ? String(Math.round(audits[id].numericValue)) : '');

    // resource-summary carries per-resource-type transfer sizes + request counts
    const summaryItems: any[] = audits['resource-summary']?.details?.items || [];
    const totalRow = summaryItems.find((i) => i.resourceType === 'total') || {};
    const imageRow = summaryItems.find((i) => i.resourceType === 'image') || {};

    return {
      performanceScore: Math.round((result.categories.performance?.score || 0) * 100),
      accessibilityScore: Math.round((result.categories.accessibility?.score || 0) * 100),
      bestPracticesScore: Math.round((result.categories['best-practices']?.score || 0) * 100),
      seoScore: Math.round((result.categories.seo?.score || 0) * 100),
      firstContentfulPaint: display('first-contentful-paint'),
      largestContentfulPaint: display('largest-contentful-paint'),
      cumulativeLayoutShift: display('cumulative-layout-shift'),
      totalBlockingTime: display('total-blocking-time'),
      speedIndex: display('speed-index'),
      timeToInteractive: display('interactive'),
      totalByteWeightKb: Math.round((totalRow.transferSize || 0) / 1024),
      requestCount: totalRow.requestCount || 0,
      imageBytesKb: Math.round((imageRow.transferSize || 0) / 1024),
      opportunities: result.opportunities || []
    };
  }

  static async runLighthouse(config: LighthouseOptions): Promise<LighthouseResult> {
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
          'robots-txt',
          'total-byte-weight',
          'network-requests',
          'resource-summary'
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

        // resource-summary details are small (~10 rows) and carry page weight data
        const resourceSummary: any = runnerResult.lhr.audits['resource-summary'];
        if (resourceSummary?.details?.items) {
          essentialAudits['resource-summary'].details = {
            items: resourceSummary.details.items.map((item: any) => ({
              resourceType: item.resourceType,
              transferSize: item.transferSize,
              requestCount: item.requestCount
            }))
          };
        }

        // Extract top performance opportunities
        const opportunities = this.extractOpportunities(runnerResult.lhr);

        return {
          url: config.url,
          timestamp: new Date().toISOString(),
          categories: runnerResult.lhr.categories,
          audits: essentialAudits, // Only essential audit data
          opportunities
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

  static async getLighthouseSummary(config: LighthouseOptions) {
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
