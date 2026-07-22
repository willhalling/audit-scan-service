import puppeteer, { Browser, BrowserContext, Page } from 'puppeteer-core';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
import { waitForPageReady } from '../utils/screenshot-helpers.js';

export const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
};

export const DESKTOP_VIEWPORT = {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false
};

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * One browser, two isolated contexts (mobile + desktop), each loading the
 * target page once. The same Page objects are reused for screenshots,
 * page.evaluate extraction and axe injection.
 */
export class ScanSession {
  private constructor(
    public readonly browser: Browser,
    public readonly mobileContext: BrowserContext,
    public readonly desktopContext: BrowserContext,
    public readonly mobilePage: Page,
    public readonly desktopPage: Page,
    public readonly finalUrl: string
  ) {}

  static async create(url: string): Promise<ScanSession> {
    console.log(`🌐 Opening scan session for: ${url}`);
    const config = await PuppeteerConfig.getLaunchOptions();
    const browser = await puppeteer.launch(config);

    try {
      const mobileContext = await browser.createBrowserContext();
      const mobilePage = await mobileContext.newPage();
      await mobilePage.setViewport(MOBILE_VIEWPORT);
      await mobilePage.setUserAgent(MOBILE_USER_AGENT);

      const desktopContext = await browser.createBrowserContext();
      const desktopPage = await desktopContext.newPage();
      await desktopPage.setViewport(DESKTOP_VIEWPORT);
      await desktopPage.setUserAgent(DESKTOP_USER_AGENT);

      // Load the page once per context, in parallel.
      await Promise.all([
        this.loadPage(mobilePage, url, 'mobile'),
        this.loadPage(desktopPage, url, 'desktop')
      ]);

      const finalUrl = mobilePage.url();
      console.log(`✅ Scan session ready (final URL: ${finalUrl})`);

      return new ScanSession(
        browser,
        mobileContext,
        desktopContext,
        mobilePage,
        desktopPage,
        finalUrl
      );
    } catch (error) {
      await this.safeClose(browser);
      throw error;
    }
  }

  private static async loadPage(page: Page, url: string, label: string): Promise<void> {
    console.log(`🌐 [${label}] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    try {
      await Promise.race([
        waitForPageReady(page, 1500),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('waitForPageReady timeout')), 8000)
        )
      ]);
    } catch {
      console.log(`⚠️ [${label}] Page ready wait timed out, continuing anyway`);
    }
  }

  private static async safeClose(browser: Browser): Promise<void> {
    try {
      await Promise.race([
        browser.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Browser close timeout')), 5000)
        )
      ]);
    } catch {
      try {
        browser.process()?.kill('SIGKILL');
      } catch {
        // ignore — nothing else we can do
      }
    }
  }

  async close(): Promise<void> {
    console.log('🔒 Closing scan session...');
    await ScanSession.safeClose(this.browser);
    console.log('✅ Scan session closed');
  }
}
