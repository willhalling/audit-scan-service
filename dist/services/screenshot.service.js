import puppeteer from 'puppeteer';
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
        let lastError = null;
        const configurations = [
            await PuppeteerConfig.getLaunchOptions(),
            await PuppeteerConfig.getAlternativeLaunchOptions()
        ];
        for (let i = 0; i < configurations.length; i++) {
            try {
                console.log(`📸 Attempting screenshot with config ${i + 1}/${configurations.length}`);
                console.log(`🔧 Config: executablePath=${configurations[i].executablePath}, args=${JSON.stringify(configurations[i].args)}`);
                const launchStartTime = Date.now();
                const browser = await puppeteer.launch(configurations[i]);
                console.log(`✅ Browser launched in ${Date.now() - launchStartTime}ms`);
                try {
                    const pageStartTime = Date.now();
                    const page = await browser.newPage();
                    console.log(`📄 New page created in ${Date.now() - pageStartTime}ms`);
                    if (options.viewport) {
                        await page.setViewport(options.viewport);
                    }
                    else {
                        await page.setViewport({ width: 1280, height: 720 });
                    }
                    const gotoStartTime = Date.now();
                    await page.goto(options.url, { waitUntil: 'networkidle2', timeout: 30000 });
                    console.log(`🌐 Page loaded in ${Date.now() - gotoStartTime}ms`);
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
                    const screenshotStartTime = Date.now();
                    const screenshot = await page.screenshot({
                        fullPage: options.fullPage || false,
                        type: 'png'
                    });
                    console.log(`📸 Screenshot taken in ${Date.now() - screenshotStartTime}ms`);
                    return screenshot;
                }
                finally {
                    await browser.close();
                }
            }
            catch (error) {
                console.error(`❌ Screenshot attempt ${i + 1} failed:`, error);
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (i === configurations.length - 1) {
                    throw lastError;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        throw lastError || new Error('All screenshot attempts failed');
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