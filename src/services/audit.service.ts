import { v4 as uuidv4 } from 'uuid';
import type { AuditRequest, PageScreenshots } from '../types/index.js';
import { firebaseService } from './firebase.service.js';
import { ScrapeService } from './scrape.service.js';
import { ScreenshotService } from './screenshot.service.js';
import { AccessibilityService } from './accessibility-new.service.js';
import { CTAAnalysisService } from './cta-analysis.service.js';

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
      await firebaseService.updateAuditStatus(auditId, 'running');
      
      console.log(`🔍 Starting audit for ${auditId}`);
      
      // Build list of URLs to scan: main URL + up to 5 custom pages
      const baseUrl = request.url.replace(/\/$/, '');
      const pagePaths = Array.isArray(request.pages) ? request.pages.slice(0, 5) : [];
      const urlsToScan = [baseUrl, ...pagePaths.map(path => path.startsWith('/') ? baseUrl + path : baseUrl + '/' + path.replace(/^\//, ''))];
      const pages = [];

      for (const urlToScan of urlsToScan) {
        // Scrape the page
        const pageData = await ScrapeService.scrapePage(urlToScan);
        pages.push(pageData);
        
        // Process the page
        console.log(`📊 Processing page: ${pageData.url}`);
        
        const host = new URL(pageData.url).hostname.replace(/^www\./, '');
        
        // Take basic screenshots (desktop + mobile) - this must succeed
        console.log(`📸 Taking screenshots for ${pageData.url}`);
        const screenshots = await ScreenshotService.takeAndUploadScreenshots(pageData.url, auditId, host);
        console.log(`📸 Screenshots result:`, screenshots);
        
        // Initialize screenshots object with cover page screenshot
        const allScreenshots: PageScreenshots = {};
        
        if (screenshots.desktopUrl) {
          allScreenshots.desktopUrl = screenshots.desktopUrl; // Cover page screenshot
          console.log(`✅ Added cover page URL: ${screenshots.desktopUrl}`);
        }
        
        // Run accessibility audit to get annotated screenshots and violations
        try {
          console.log(`♿ Running accessibility audit for ${pageData.url}`);
          // Run desktop accessibility audit
          const desktopResult = await AccessibilityService.runSingleAccessibilityAudit(pageData.url, auditId, host, 'desktop');
          // Run mobile accessibility audit
          const mobileResult = await AccessibilityService.runSingleAccessibilityAudit(pageData.url, auditId, host, 'mobile');
          // Add annotated screenshots
          if (desktopResult.annotatedScreenshotUrl) {
            allScreenshots.annotatedDesktopUrl = desktopResult.annotatedScreenshotUrl;
            console.log(`✅ Added annotated desktop URL: ${desktopResult.annotatedScreenshotUrl}`);
          } else {
            console.log('⚠️ No annotated desktop screenshot URL returned.');
          }
          if (mobileResult.annotatedScreenshotUrl) {
            allScreenshots.annotatedMobileUrl = mobileResult.annotatedScreenshotUrl;
            console.log(`✅ Added annotated mobile URL: ${mobileResult.annotatedScreenshotUrl}`);
          } else {
            console.log('⚠️ No annotated mobile screenshot URL returned.');
          }
          // Save only description, help, severity, and metadata for violations
          const nonVisualIds = ['document-title', 'html-has-lang', 'meta-viewport', 'landmark-one-main', 'region', 'page-has-heading-one'];
          pageData.accessibilityDesktop = {
            violations: desktopResult.violations.map(v => ({
              id: v.id,
              issue: v.description,
              suggestion: v.help,
              severity: v.impact,
              isVisual: !nonVisualIds.includes(v.id)
            }))
          };
          pageData.accessibilityMobile = {
            violations: mobileResult.violations.map(v => ({
              id: v.id,
              issue: v.description,
              suggestion: v.help,
              severity: v.impact,
              isVisual: !nonVisualIds.includes(v.id)
            }))
          };
          // To revert to saving all data, just use: violations: desktopResult.violations
        } catch (accessibilityError) {
          console.error(`⚠️ Accessibility audit failed for ${pageData.url}, continuing without annotated screenshots:`, accessibilityError);
        }

        // Run Lighthouse audits sequentially (desktop, then mobile)
        try {
          console.log(`🚦 Running Lighthouse desktop audit for ${pageData.url}`);
          const lighthouseDesktop = await (await import('./lighthouse.service.js')).LighthouseService.runLighthouse({
            url: pageData.url,
            useDesktop: true
          });
          // Save scores and core vitals
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
            interactionToNextPaint: Math.round(lighthouseDesktop.audits['interactive']?.numericValue || 0),
            violations: lighthouseDesktop.violations || []
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
            interactionToNextPaint: Math.round(lighthouseMobile.audits['interactive']?.numericValue || 0),
            violations: lighthouseMobile.violations || []
          };
          console.log('✅ Lighthouse mobile audit complete');
          // To revert to saving all data, just use: pageData.lighthouseDesktop = lighthouseDesktop
        } catch (lighthouseError) {
          console.error(`⚠️ Lighthouse audit failed for ${pageData.url}:`, lighthouseError);
        }

        // Run CTA visual analysis if CTAs are present
        if (pageData.ctas && pageData.ctas.length > 0) {
          try {
            console.log(`🎯 Running CTA visual analysis for ${pageData.url} (${pageData.ctas.length} CTAs found)`);
            const ctaAnalysis = await CTAAnalysisService.analyzeCTAs(pageData.url, {
              enabled: request.enableCTAAnalysis ?? true, // Default enabled, can be disabled via request
              maxCTAs: request.maxCTAsToAnalyze ?? 3, // Default 3, configurable via request
              useExistingBrowser: false // Use separate browser for now, can optimize later
            });
            
            if (ctaAnalysis) {
              pageData.ctaAnalysis = ctaAnalysis;
              console.log(`✅ CTA visual analysis completed for ${pageData.url}: ${ctaAnalysis.analyzedCTAs.length} CTAs analyzed`);
            } else {
              console.log(`⚠️ CTA visual analysis returned null for ${pageData.url}`);
            }
          } catch (ctaError) {
            console.error(`⚠️ CTA visual analysis failed for ${pageData.url}:`, ctaError);
            // Continue without CTA analysis - don't break the audit
          }
        } else {
          console.log(`ℹ️ Skipping CTA visual analysis for ${pageData.url} - no CTAs found`);
        }
        
        console.log(`📊 Final screenshots (3 total):`, allScreenshots);
        
        // Add screenshots to page
        pageData.screenshots = allScreenshots;
        console.log(`✅ Screenshots added to pageData:`, pageData.screenshots);
      }

      // Run AI analysis on each page at the end
      console.log(`🤖 Running AI analysis on ${pages.length} pages`);
      for (const pageData of pages) {
        try {
          const aiAnalysis = await (await import('./ai.service.js')).AIService.analyzePage(pageData, request.enableAI ?? true);
          pageData.ai = aiAnalysis;
          console.log(`✅ AI analysis completed for ${pageData.url}`);
        } catch (aiError) {
          console.error(`⚠️ AI analysis failed for ${pageData.url}:`, aiError);
          // Continue without AI analysis
        }
      }

      // Run conversion optimization analysis on each page
      console.log(`🎯 Running conversion optimization analysis on ${pages.length} pages`);
      for (const pageData of pages) {
        try {
          const conversionAnalysis = await (await import('./conversion-optimization.service.js')).ConversionOptimizationService.analyzePageForConversion(pageData, request.enableAI ?? true);
          pageData.conversionOptimization = conversionAnalysis;
          console.log(`✅ Conversion optimization analysis completed for ${pageData.url}`);
        } catch (conversionError) {
          console.error(`⚠️ Conversion optimization analysis failed for ${pageData.url}:`, conversionError);
          // Continue without conversion optimization analysis
        }
      }

      // Save all pages to Firebase
      console.log(`💾 Saving page data to Firebase`);
      await firebaseService.updateAuditPages(auditId, pages);
      
      // Mark as completed
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
