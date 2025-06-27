import { v4 as uuidv4 } from 'uuid';
import { firebaseService } from './firebase.service.js';
import { ScrapeService } from './scrape.service.js';
import { ScreenshotService } from './screenshot.service.js';
import { AccessibilityService } from './accessibility-new.service.js';
export class AuditService {
    static generateAuditId(url) {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        const randomId = uuidv4().split('-')[0];
        return `${domain}-${randomId}`;
    }
    static async validateUrl(url) {
        try {
            console.log(`🔍 Validating URL: ${url}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                return {
                    valid: false,
                    error: `URL returned ${response.status} ${response.statusText}`
                };
            }
            console.log(`✅ URL is valid: ${url}`);
            return { valid: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.log(`❌ URL validation failed: ${errorMessage}`);
            return {
                valid: false,
                error: `URL cannot be reached: ${errorMessage}`
            };
        }
    }
    static async startAudit(request) {
        const validation = await this.validateUrl(request.url);
        if (!validation.valid) {
            const result = {
                auditId: ''
            };
            if (validation.error) {
                result.error = validation.error;
            }
            return result;
        }
        const auditId = this.generateAuditId(request.url);
        await firebaseService.createAudit(auditId, request.url);
        this.runAudit(auditId, request).catch(async (error) => {
            console.error(`❌ Audit ${auditId} failed:`, error);
            await firebaseService.updateAuditError(auditId, error.message);
        });
        return { auditId };
    }
    static async runAudit(auditId, request) {
        try {
            await firebaseService.updateAuditStatus(auditId, 'running');
            console.log(`🔍 Starting audit for ${auditId}`);
            const baseUrl = request.url.replace(/\/$/, '');
            const pagePaths = Array.isArray(request.pages) ? request.pages.slice(0, 5) : [];
            const urlsToScan = [baseUrl, ...pagePaths.map(path => path.startsWith('/') ? baseUrl + path : baseUrl + '/' + path.replace(/^\//, ''))];
            const pages = [];
            for (const urlToScan of urlsToScan) {
                const pageData = await ScrapeService.scrapePage(urlToScan);
                pages.push(pageData);
                console.log(`📊 Processing page: ${pageData.url}`);
                const host = new URL(pageData.url).hostname.replace(/^www\./, '');
                console.log(`📸 Taking screenshots for ${pageData.url}`);
                const screenshots = await ScreenshotService.takeAndUploadScreenshots(pageData.url, auditId, host);
                console.log(`📸 Screenshots result:`, screenshots);
                const allScreenshots = {};
                if (screenshots.desktopUrl) {
                    allScreenshots.desktopUrl = screenshots.desktopUrl;
                    console.log(`✅ Added cover page URL: ${screenshots.desktopUrl}`);
                }
                try {
                    console.log(`♿ Running accessibility audit for ${pageData.url}`);
                    const desktopResult = await AccessibilityService.runSingleAccessibilityAudit(pageData.url, auditId, host, 'desktop');
                    const mobileResult = await AccessibilityService.runSingleAccessibilityAudit(pageData.url, auditId, host, 'mobile');
                    if (desktopResult.annotatedScreenshotUrl) {
                        allScreenshots.annotatedDesktopUrl = desktopResult.annotatedScreenshotUrl;
                        console.log(`✅ Added annotated desktop URL: ${desktopResult.annotatedScreenshotUrl}`);
                    }
                    else {
                        console.log('⚠️ No annotated desktop screenshot URL returned.');
                    }
                    if (mobileResult.annotatedScreenshotUrl) {
                        allScreenshots.annotatedMobileUrl = mobileResult.annotatedScreenshotUrl;
                        console.log(`✅ Added annotated mobile URL: ${mobileResult.annotatedScreenshotUrl}`);
                    }
                    else {
                        console.log('⚠️ No annotated mobile screenshot URL returned.');
                    }
                    pageData.accessibilityDesktop = {
                        violations: desktopResult.violations.map(v => ({
                            issue: v.description,
                            suggestion: v.help
                        }))
                    };
                    pageData.accessibilityMobile = {
                        violations: mobileResult.violations.map(v => ({
                            issue: v.description,
                            suggestion: v.help
                        }))
                    };
                }
                catch (accessibilityError) {
                    console.error(`⚠️ Accessibility audit failed for ${pageData.url}, continuing without annotated screenshots:`, accessibilityError);
                }
                try {
                    console.log(`🚦 Running Lighthouse desktop audit for ${pageData.url}`);
                    const lighthouseDesktop = await (await import('./lighthouse.service.js')).LighthouseService.runLighthouse({
                        url: pageData.url,
                        useDesktop: true
                    });
                    pageData.lighthouseDesktop = {
                        performance: Math.round((lighthouseDesktop.categories.performance?.score || 0) * 100),
                        accessibility: Math.round((lighthouseDesktop.categories.accessibility?.score || 0) * 100),
                        bestPractices: Math.round((lighthouseDesktop.categories['best-practices']?.score || 0) * 100),
                        seo: Math.round((lighthouseDesktop.categories.seo?.score || 0) * 100),
                        firstContentfulPaint: Math.round(lighthouseDesktop.audits['first-contentful-paint']?.numericValue || 0),
                        largestContentfulPaint: Math.round(lighthouseDesktop.audits['largest-contentful-paint']?.numericValue || 0),
                        cumulativeLayoutShift: lighthouseDesktop.audits['cumulative-layout-shift']?.numericValue || 0,
                        totalBlockingTime: Math.round(lighthouseDesktop.audits['total-blocking-time']?.numericValue || 0),
                        speedIndex: Math.round(lighthouseDesktop.audits['speed-index']?.numericValue || 0),
                        interactionToNextPaint: Math.round(lighthouseDesktop.audits['interactive']?.numericValue || 0)
                    };
                    console.log('✅ Lighthouse desktop audit complete');
                    console.log(`🚦 Running Lighthouse mobile audit for ${pageData.url}`);
                    const lighthouseMobile = await (await import('./lighthouse.service.js')).LighthouseService.runLighthouse({
                        url: pageData.url,
                        useDesktop: false
                    });
                    pageData.lighthouseMobile = {
                        performance: Math.round((lighthouseMobile.categories.performance?.score || 0) * 100),
                        accessibility: Math.round((lighthouseMobile.categories.accessibility?.score || 0) * 100),
                        bestPractices: Math.round((lighthouseMobile.categories['best-practices']?.score || 0) * 100),
                        seo: Math.round((lighthouseMobile.categories.seo?.score || 0) * 100),
                        firstContentfulPaint: Math.round(lighthouseMobile.audits['first-contentful-paint']?.numericValue || 0),
                        largestContentfulPaint: Math.round(lighthouseMobile.audits['largest-contentful-paint']?.numericValue || 0),
                        cumulativeLayoutShift: lighthouseMobile.audits['cumulative-layout-shift']?.numericValue || 0,
                        totalBlockingTime: Math.round(lighthouseMobile.audits['total-blocking-time']?.numericValue || 0),
                        speedIndex: Math.round(lighthouseMobile.audits['speed-index']?.numericValue || 0),
                        interactionToNextPaint: Math.round(lighthouseMobile.audits['interactive']?.numericValue || 0)
                    };
                    console.log('✅ Lighthouse mobile audit complete');
                }
                catch (lighthouseError) {
                    console.error(`⚠️ Lighthouse audit failed for ${pageData.url}:`, lighthouseError);
                }
                console.log(`📊 Final screenshots (3 total):`, allScreenshots);
                pageData.screenshots = [allScreenshots];
                console.log(`✅ Screenshots added to pageData:`, pageData.screenshots);
            }
            console.log(`💾 Saving page data to Firebase`);
            await firebaseService.updateAuditPages(auditId, pages);
            await firebaseService.updateAuditStatus(auditId, 'completed');
            console.log(`✅ Audit ${auditId} completed successfully`);
        }
        catch (error) {
            console.error(`❌ Error during audit ${auditId}:`, error);
            throw error;
        }
    }
    static async getAuditStatus(auditId) {
        return await firebaseService.getAudit(auditId);
    }
}
//# sourceMappingURL=audit.service.js.map