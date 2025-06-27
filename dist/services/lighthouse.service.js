import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
export class LighthouseService {
    static async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                await task();
            }
        }
        this.isProcessing = false;
    }
    static queueLighthouse(task) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
            this.processQueue();
        });
    }
    static async runLighthouse(config) {
        return this.queueLighthouse(async () => {
            const chrome = await chromeLauncher.launch({
                chromeFlags: await PuppeteerConfig.getChromeLauncherFlags(),
                chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                startingUrl: 'about:blank'
            });
            try {
                const options = {
                    logLevel: 'error',
                    output: 'json',
                    onlyCategories: config.categories || ['performance', 'accessibility', 'best-practices', 'seo'],
                    port: chrome.port,
                    settings: {
                        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
                        skipAudits: ['unused-javascript', 'unused-css-rules'],
                        disableStorageReset: true
                    }
                };
                const lighthouseConfig = config.useDesktop ? this.DESKTOP_CONFIG : this.MOBILE_CONFIG;
                const runnerResult = await lighthouse(config.url, options, lighthouseConfig);
                if (!runnerResult?.lhr) {
                    throw new Error('Lighthouse failed to generate report');
                }
                const essentialAudits = {};
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
                        };
                    }
                }
                return {
                    url: config.url,
                    timestamp: new Date().toISOString(),
                    categories: runnerResult.lhr.categories,
                    audits: essentialAudits,
                    lighthouseVersion: runnerResult.lhr.lighthouseVersion,
                    userAgent: runnerResult.lhr.userAgent
                };
            }
            finally {
                await chrome.kill();
            }
        });
    }
    static async getLighthouseSummary(config) {
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
}
LighthouseService.queue = [];
LighthouseService.isProcessing = false;
LighthouseService.DESKTOP_CONFIG = {
    extends: 'lighthouse:default',
    settings: {
        formFactor: 'desktop',
        throttling: { rttMs: 0, throughputKbps: 0, cpuSlowdownMultiplier: 1 },
        throttlingMethod: 'provided',
        screenEmulation: { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false },
        emulatedUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
    }
};
LighthouseService.MOBILE_CONFIG = {
    extends: 'lighthouse:default',
    settings: {
        formFactor: 'mobile',
        throttling: { rttMs: 0, throughputKbps: 0, cpuSlowdownMultiplier: 1 },
        throttlingMethod: 'provided',
        screenEmulation: { width: 412, height: 823, deviceScaleFactor: 2.625, mobile: true },
        emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36'
    }
};
//# sourceMappingURL=lighthouse.service.js.map