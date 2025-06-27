import { v4 as uuidv4 } from 'uuid';
import { AuditRequest, PageScreenshots } from '../types/index.js';
import { firebaseService } from './firebase.service.js';
import { ScrapeService } from './scrape.service.js';
import { ScreenshotService } from './screenshot.service.js';
import { AccessibilityService } from './accessibility-new.service.js';

export class AuditService {
  static generateAuditId(url: string): string {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    const randomId = uuidv4().split('-')[0];
    return `${domain}-${randomId}`;
  }

  static async validateUrl(url: string): Promise<{ valid: boolean; error?: string }> {
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

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`❌ URL validation failed: ${errorMessage}`);
      
      return {
        valid: false,
        error: `URL cannot be reached: ${errorMessage}`
      };
    }
  }

  static async startAudit(request: AuditRequest): Promise<{ auditId: string; error?: string }> {
    // Validate URL first
    const validation = await this.validateUrl(request.url);
    if (!validation.valid) {
      const result: { auditId: string; error?: string } = {
        auditId: ''
      };
      if (validation.error) {
        result.error = validation.error;
      }
      return result;
    }

    const auditId = this.generateAuditId(request.url);
    
    // Create audit record in Firebase
    await firebaseService.createAudit(auditId, request.url);
    
    // Start the audit process in the background
    this.runAudit(auditId, request).catch(async (error) => {
      console.error(`❌ Audit ${auditId} failed:`, error);
      await firebaseService.updateAuditError(auditId, error.message);
    });
    
    return { auditId };
  }

  private static async runAudit(auditId: string, request: AuditRequest): Promise<void> {
    try {
      await firebaseService.updateAuditStatus(auditId, 'running');
      
      console.log(`🔍 Starting audit for ${auditId}`);
      
      // Scrape the main page
      const pageData = await ScrapeService.scrapePage(request.url);
      const pages = [pageData];
      
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
      
      // Run accessibility audit to get annotated screenshots
      try {
        console.log(`♿ Running accessibility audit for ${pageData.url}`);
        const accessibilityResult = await AccessibilityService.runAccessibilityAudit(pageData.url, auditId, host);
        console.log(`♿ Accessibility result:`, accessibilityResult);
        
        // Add annotated screenshots (these are the accessibility overview screenshots)
        if (accessibilityResult.annotatedDesktopUrl) {
          allScreenshots.annotatedDesktopUrl = accessibilityResult.annotatedDesktopUrl;
          console.log(`✅ Added annotated desktop URL: ${accessibilityResult.annotatedDesktopUrl}`);
        } else {
          console.log('⚠️ No annotated desktop screenshot URL returned.');
        }
        if (accessibilityResult.annotatedMobileUrl) {
          allScreenshots.annotatedMobileUrl = accessibilityResult.annotatedMobileUrl;
          console.log(`✅ Added annotated mobile URL: ${accessibilityResult.annotatedMobileUrl}`);
        } else {
          console.log('⚠️ No annotated mobile screenshot URL returned.');
        }
        
        // Update accessibility data
        pageData.accessibility = {
          missingAltCount: accessibilityResult.accessibility.summary?.totalViolations || 0,
          totalImages: 0,
          missingAltExamples: []
        };
        
      } catch (accessibilityError) {
        console.error(`⚠️ Accessibility audit failed for ${pageData.url}, continuing without annotated screenshots:`, accessibilityError);
        // Keep default accessibility data
      }
      
      console.log(`📊 Final screenshots (3 total):`, allScreenshots);
      
      // Add screenshots to page
      pageData.screenshots = [allScreenshots];
      console.log(`✅ Screenshots added to pageData:`, pageData.screenshots);
      
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
