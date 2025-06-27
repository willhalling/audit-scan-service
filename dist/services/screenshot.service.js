import puppeteer from 'puppeteer';
import { StorageService } from './storage.service.js';
export class ScreenshotService {
    static async takeScreenshot(options) {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        try {
            const page = await browser.newPage();
            if (options.viewport) {
                await page.setViewport(options.viewport);
            }
            else {
                await page.setViewport({ width: 1280, height: 720 });
            }
            await page.goto(options.url, { waitUntil: 'networkidle2', timeout: 30000 });
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
    static async takeAndUploadScreenshots(url, auditId, host) {
        console.log(`📸 Taking cover page screenshot for ${url}`);
        const coverScreenshot = await this.takeScreenshot({
            url,
            viewport: { width: 1920, height: 1080 },
            fullPage: false
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