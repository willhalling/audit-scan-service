import puppeteer from 'puppeteer-core';
import { Page } from 'puppeteer-core';
import { ScreenshotOptions, AuditScreenshots } from '../types/index.js';
import { StorageService } from './storage.service.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
import { hideElementsForScreenshot, waitForPageReady, blockAggressiveMapResources } from '../utils/screenshot-helpers.js';
import { ScanSession } from './scan-session.service.js';

export type AuditScreenshotType = 'mobile-fold' | 'desktop-fold' | 'mobile-full' | 'desktop-full';

export class ScreenshotService {
  /**
   * Simple one-off screenshot used by the /screenshot endpoint and the
   * RunPod `screenshot` action. Launches a dedicated browser.
   */
  static async takeScreenshot(options: ScreenshotOptions): Promise<Buffer> {
    console.log(`📸 Starting screenshot for: ${options.url}`);

    try {
      return await this.attemptScreenshot(options, false);
    } catch (error) {
      console.log(`❌ Normal screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      console.log(`🛡️ Retrying with aggressive map blocking...`);
      return await this.attemptScreenshot(options, true);
    } catch (error) {
      console.error(`❌ All screenshot strategies failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error('Screenshot generation completely failed');
    }
  }

  private static async attemptScreenshot(options: ScreenshotOptions, aggressive: boolean): Promise<Buffer> {
    const config = await PuppeteerConfig.getLaunchOptions();
    const browser = await puppeteer.launch(config);

    try {
      const page = await browser.newPage();

      if (options.viewport) {
        await page.setViewport(options.viewport);
      }

      if (aggressive) {
        await blockAggressiveMapResources(page);
      }

      await page.goto(options.url, {
        waitUntil: 'domcontentloaded',
        timeout: aggressive ? 25000 : 30000
      });

      const hideSelectors = aggressive
        ? [...(options.hideSelectors || []), '[id*="map"]', '[class*="map"]', '.leaflet-container', '.mapboxgl-map', '.google-map', 'iframe[src*="maps"]', '.osm-map', '#map', '.map']
        : options.hideSelectors;
      await hideElementsForScreenshot(page, hideSelectors);

      try {
        await Promise.race([
          waitForPageReady(page, 1000),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('waitForPageReady timeout')), 8000)
          )
        ]);
      } catch {
        console.log('⚠️ Page ready wait timed out, proceeding with screenshot');
      }

      const screenshot = await Promise.race([
        page.screenshot({ fullPage: options.fullPage || false, type: 'png' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Screenshot timeout after 10 seconds')), 10000)
        )
      ]);

      return screenshot as Buffer;
    } finally {
      try {
        await Promise.race([
          browser.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), 5000))
        ]);
      } catch {
        try {
          browser.process()?.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Audit screenshots — captured from the shared ScanSession pages
  // -------------------------------------------------------------------------

  /**
   * Capture a screenshot from an already-loaded page (shared scan session).
   * JPEG quality ~80 keeps files small for the AI vision step.
   */
  static async captureFromPage(page: Page, fullPage: boolean): Promise<Buffer> {
    await hideElementsForScreenshot(page);

    const screenshot = await Promise.race([
      page.screenshot({ fullPage, type: 'jpeg', quality: 80 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Screenshot timeout after 15 seconds')), 15000)
      )
    ]);

    return screenshot as Buffer;
  }

  /**
   * Above-fold mobile + desktop shots (fast). Each is uploaded as soon as it
   * is captured so partial results can be written to Firestore immediately.
   */
  static async captureFoldScreenshots(
    session: ScanSession,
    auditId: string,
    host: string
  ): Promise<Pick<AuditScreenshots, 'mobileFoldUrl' | 'desktopFoldUrl'>> {
    console.log('📸 Capturing above-fold screenshots (mobile + desktop)...');

    const capture = async (
      page: Page,
      type: AuditScreenshotType
    ): Promise<string> => {
      const buffer = await this.captureFromPage(page, false);
      return StorageService.uploadScreenshot(buffer, host, auditId, type);
    };

    const [mobile, desktop] = await Promise.allSettled([
      capture(session.mobilePage, 'mobile-fold'),
      capture(session.desktopPage, 'desktop-fold')
    ]);

    if (mobile.status === 'rejected') console.warn('⚠️ Mobile fold screenshot failed:', mobile.reason);
    if (desktop.status === 'rejected') console.warn('⚠️ Desktop fold screenshot failed:', desktop.reason);

    return {
      ...(mobile.status === 'fulfilled' ? { mobileFoldUrl: mobile.value } : {}),
      ...(desktop.status === 'fulfilled' ? { desktopFoldUrl: desktop.value } : {})
    };
  }

  /**
   * Full-page mobile + desktop shots in parallel. Callers should treat this
   * as non-critical and patch the audit doc when it resolves.
   */
  static async captureFullScreenshots(
    session: ScanSession,
    auditId: string,
    host: string
  ): Promise<Pick<AuditScreenshots, 'mobileFullUrl' | 'desktopFullUrl'>> {
    console.log('📸 Capturing full-page screenshots (mobile + desktop)...');

    const capture = async (
      page: Page,
      type: AuditScreenshotType
    ): Promise<string> => {
      const buffer = await this.captureFromPage(page, true);
      return StorageService.uploadScreenshot(buffer, host, auditId, type);
    };

    const [mobile, desktop] = await Promise.allSettled([
      capture(session.mobilePage, 'mobile-full'),
      capture(session.desktopPage, 'desktop-full')
    ]);

    if (mobile.status === 'rejected') console.warn('⚠️ Mobile full screenshot failed:', mobile.reason);
    if (desktop.status === 'rejected') console.warn('⚠️ Desktop full screenshot failed:', desktop.reason);

    return {
      ...(mobile.status === 'fulfilled' ? { mobileFullUrl: mobile.value } : {}),
      ...(desktop.status === 'fulfilled' ? { desktopFullUrl: desktop.value } : {})
    };
  }
}
