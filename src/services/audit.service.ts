import type { AuditRequest, PageData, LighthouseResult, ReducedLighthouseData, ModernSite } from '../types/index.js';
import { firebaseService } from './firebase.service.js';
import { ScrapeService } from './scrape.service.js';
import { ScreenshotService } from './screenshot.service.js';
import { importManagedSitesPreview } from './import.service.js';

function reduceLighthouseResult(result: LighthouseResult): ReducedLighthouseData {
  return {
    performance: Math.round((result.categories.performance?.score || 0) * 100),
    accessibility: Math.round((result.categories.accessibility?.score || 0) * 100),
    bestPractices: Math.round((result.categories['best-practices']?.score || 0) * 100),
    seo: Math.round((result.categories.seo?.score || 0) * 100),
    firstContentfulPaint: Math.round(result.audits['first-contentful-paint']?.numericValue || 0),
    largestContentfulPaint: Math.round(result.audits['largest-contentful-paint']?.numericValue || 0),
    cumulativeLayoutShift: result.audits['cumulative-layout-shift']?.numericValue || 0,
    totalBlockingTime: Math.round(result.audits['total-blocking-time']?.numericValue || 0),
    speedIndex: Math.round(result.audits['speed-index']?.numericValue || 0),
    interactionToNextPaint: Math.round(result.audits['interactive']?.numericValue || 0),
    violations: result.violations || []
  };
}

export class AuditService {

  static async startAudit(request: AuditRequest & { auditId: string }): Promise<{ auditId: string; error?: string }> {

    const auditId = request.auditId;

    // Create audit record in Firebase with authorUid if provided
    await firebaseService.createAudit(auditId, request.url, request.authorUid);
    
    // Start the audit process in the background
    await this.runAudit(auditId, request).catch(async (error) => {
      console.error(`❌ Audit ${auditId} failed:`, error);
      await firebaseService.updateAuditError(auditId, error.message);
    });
    
    return { auditId };
  }

  private static async runAudit(auditId: string, request: AuditRequest): Promise<void> {
    try {
      const url = request.url.replace(/\/$/, '');
      const host = new URL(url).hostname.replace(/^www\./, '');

      console.log(`🔍 Starting lightweight audit for ${auditId}: ${url}`);

      // 1. Scrape the original page
      await firebaseService.updateAuditStatus(auditId, 'analysing');
      const pageData = await ScrapeService.scrapePage(url);
      pageData.pagePath = pageData.pagePath || '/';
      console.log(`📄 Scraped page: ${pageData.url}`);

      pageData.screenshots = {};

      // 2. Plain desktop + mobile screenshots
      await firebaseService.updateAuditStatus(auditId, 'screenshot');
      try {
        const plainScreenshots = await ScreenshotService.takePlainScreenshots(url, auditId, host);
        pageData.screenshots = {
          desktopUrl: plainScreenshots.desktopUrl,
          mobileUrl: plainScreenshots.mobileUrl
        };
        console.log(`📸 Plain screenshots captured`);
      } catch (screenshotError) {
        console.warn(`⚠️ Screenshot capture failed for ${url}:`, screenshotError);
      }

      // 3. Lighthouse (desktop + mobile) — cycle through status labels
      const LighthouseService = (await import('./lighthouse.service.js')).LighthouseService;

      await firebaseService.updateAuditStatus(auditId, 'performance');
      try {
        const lighthouseDesktop = await LighthouseService.runLighthouse({ url, useDesktop: true });
        pageData.lighthouseDesktop = reduceLighthouseResult(lighthouseDesktop);
        console.log(`✅ Lighthouse desktop complete`);
      } catch (lighthouseError) {
        console.warn(`⚠️ Lighthouse desktop failed for ${url}:`, lighthouseError);
      }

      await firebaseService.updateAuditStatus(auditId, 'accessibility');
      await firebaseService.updateAuditStatus(auditId, 'seo');
      try {
        const lighthouseMobile = await LighthouseService.runLighthouse({ url, useDesktop: false });
        pageData.lighthouseMobile = reduceLighthouseResult(lighthouseMobile);
        console.log(`✅ Lighthouse mobile complete`);
      } catch (lighthouseError) {
        console.warn(`⚠️ Lighthouse mobile failed for ${url}:`, lighthouseError);
      }

      // 4. Save original page data
      await firebaseService.updateAuditStatus(auditId, 'content');
      await firebaseService.updateAuditPages(auditId, [pageData]);
      console.log(`💾 Original page data saved`);

      // 5. Build the ManagedSites preview, capture its screenshots and scores
      await firebaseService.updateAuditStatus(auditId, 'building');
      const modernSite: ModernSite = {};
      const preview = await importManagedSitesPreview(url, auditId);

      if (preview) {
        modernSite.previewUrl = preview.previewUrl;
        modernSite.friendlyId = preview.friendlyId;
        modernSite.businessId = preview.businessId;
        const modernScreenshots = await ScreenshotService.takePlainScreenshots(
          preview.previewUrl,
          auditId,
          host
        );
        modernSite.desktopUrl = modernScreenshots.desktopUrl;
        modernSite.mobileUrl = modernScreenshots.mobileUrl;
        console.log(`📸 ManagedSites preview screenshots captured`);

        try {
          const modernLighthouse = await LighthouseService.runLighthouse({
            url: preview.previewUrl,
            useDesktop: true
          });
          modernSite.lighthouseDesktop = reduceLighthouseResult(modernLighthouse);
          console.log(`✅ ManagedSites preview Lighthouse complete`);
        } catch (lighthouseError) {
          console.warn(`⚠️ ManagedSites preview Lighthouse failed:`, lighthouseError);
        }
      } else {
        console.log('⚠️ No ManagedSites preview built (import disabled or failed)');
      }

      await firebaseService.updateAuditModernSite(auditId, modernSite);

      // 6. Completed
      await firebaseService.updateAuditStatus(auditId, 'completed');
      console.log(`✅ Audit ${auditId} completed successfully`);

    } catch (error) {
      console.error(`❌ Error during audit ${auditId}:`, error);
      throw error;
    }
  }

  static async getAuditStatus(auditId: string) {
    return await firebaseService.getAudit(auditId);
  }
}
