import puppeteer from 'puppeteer-core';
import { StorageService } from './storage.service.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
export class ScreenshotService {
    static async takeScreenshot(options) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Screenshot timeout after 45 seconds')), 45000);
        });
        const screenshotPromise = this.attemptScreenshot(options);
        try {
            return await Promise.race([screenshotPromise, timeoutPromise]);
        }
        catch (error) {
            console.error('❌ Screenshot failed with timeout or error:', error);
            throw error;
        }
    }
    static async attemptScreenshot(options) {
        await PuppeteerConfig.forceCleanup();
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
            }
            else {
                console.log(`📐 Using default viewport`);
            }
            console.log(`🌐 Navigating to: ${options.url}`);
            const navStartTime = Date.now();
            await page.goto(options.url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            console.log(`✅ Page loaded in ${Date.now() - navStartTime}ms`);
            if (options.hideSelectors && options.hideSelectors.length > 0) {
                await page.evaluate((selectors) => {
                    selectors.forEach((selector) => {
                        const el = document.querySelector(selector);
                        if (el) {
                            el.style.display = 'none';
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
            return screenshot;
        }
        finally {
            try {
                console.log('🔄 Closing browser...');
                await browser.close();
                console.log('✅ Browser closed successfully');
            }
            catch (closeError) {
                console.warn('⚠️ Error closing browser:', closeError);
                await PuppeteerConfig.forceCleanup();
            }
        }
    }
    static async processQueue() {
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
                }
                catch (error) {
                    console.error('❌ Queue task failed:', error);
                }
            }
        }
        this.isProcessing = false;
    }
    static queueScreenshot(task) {
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
    static async takeAndUploadScreenshots(url, auditId, host) {
        console.log(`📸 Taking cover page screenshot for ${url}`);
        const coverScreenshot = await this.takeScreenshot({
            url,
            viewport: { width: 1366, height: 850 },
            fullPage: false
        });
        const desktopUrl = await StorageService.uploadScreenshot(coverScreenshot, auditId, 'desktop', host);
        console.log(`✅ Cover page screenshot uploaded: ${desktopUrl}`);
        return {
            desktopUrl
        };
    }
}
ScreenshotService.queue = [];
ScreenshotService.isProcessing = false;
ScreenshotService.DIMENSIONS = {
    DESKTOP: { width: 1920, height: 1080 },
    MOBILE: { width: 375, height: 667 },
    DESKTOP_ACCESSIBILITY: { width: 545, height: 500 },
    MOBILE_ACCESSIBILITY: { width: 298, height: 742 },
    COVER_PAGE: { width: 1920, height: 1080 }
};
//# sourceMappingURL=screenshot.service.js.map