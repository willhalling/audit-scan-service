import puppeteer from 'puppeteer';
import { StorageService } from './storage.service.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
export class ScreenshotService {
    static async takeScreenshot(options) {
        let lastError = null;
        const configurations = [
            await PuppeteerConfig.getLaunchOptions(),
            await PuppeteerConfig.getAlternativeLaunchOptions()
        ];
        for (let i = 0; i < configurations.length; i++) {
            try {
                console.log(`📸 Attempting screenshot with config ${i + 1}/${configurations.length}`);
                const browser = await puppeteer.launch(configurations[i]);
                try {
                    const page = await browser.newPage();
                    if (options.viewport) {
                        await page.setViewport(options.viewport);
                    }
                    else {
                        await page.setViewport({ width: 1280, height: 720 });
                    }
                    await page.goto(options.url, { waitUntil: 'networkidle2', timeout: 30000 });
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
                    const screenshot = await page.screenshot({
                        fullPage: options.fullPage || false,
                        type: 'png'
                    });
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
    static async takeAndUploadScreenshots(url, auditId, host) {
        console.log(`📸 Taking cover page screenshot for ${url}`);
        const coverScreenshot = await this.takeScreenshot({
            url,
            viewport: { width: 1366, height: 850 },
            fullPage: false,
            hideSelectors: ['#CybotCookiebotDialog']
        });
        const desktopUrl = await StorageService.uploadScreenshot(coverScreenshot, auditId, 'desktop', host);
        console.log(`✅ Cover page screenshot uploaded: ${desktopUrl}`);
        return {
            desktopUrl
        };
    }
}
ScreenshotService.DIMENSIONS = {
    DESKTOP: { width: 1920, height: 1080 },
    MOBILE: { width: 375, height: 667 },
    DESKTOP_ACCESSIBILITY: { width: 545, height: 500 },
    MOBILE_ACCESSIBILITY: { width: 298, height: 742 },
    COVER_PAGE: { width: 1920, height: 1080 }
};
//# sourceMappingURL=screenshot.service.js.map