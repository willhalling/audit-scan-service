import { LaunchOptions } from 'puppeteer';

export class PuppeteerConfig {
  /**
   * Get optimized Puppeteer launch options for production environments
   * Uses system Chromium for maximum compatibility
   */
  static async getLaunchOptions(): Promise<any> {
    console.log('🔍 Using system Chromium configuration');
    
    // Force use of system Chromium
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    console.log(`🎯 Chromium executable path: ${executablePath}`);
    
    const launchOptions: any = {
      headless: 'new',
      timeout: 30000, // Reduced timeout to fail faster
      args: this.getSystemChromiumArgs(),
      executablePath: executablePath,
      defaultViewport: { width: 1280, height: 720 }, // Add explicit viewport
      handleSIGINT: false // Don't handle signals in container
    };

    return launchOptions;
  }

  /**
   * Get alternative launch options for fallback
   */
  static async getAlternativeLaunchOptions(): Promise<any> {
    console.log('🔄 Using minimal Chromium configuration');
    const launchOptions: any = {
      headless: 'new',
      timeout: 30000, // Reduced timeout to fail faster
      args: [
        '--headless',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--remote-debugging-port=0',
        '--enable-logging',
        '--log-level=0'
      ]
    };

    // Force use of system chromium
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

    return launchOptions;
  }

  /**
   * Get system Chromium arguments optimized for Cloud Run
   * Using exact same minimal flags that work for Chrome Launcher
   */
  private static getSystemChromiumArgs(): string[] {
    return [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-zygote',
      '--single-process',
      '--remote-debugging-port=0', // Let Puppeteer assign port dynamically
      '--enable-logging',
      '--log-level=0'
    ];
  }

  /**
   * Get Chrome launcher flags for Lighthouse
   * Using proven configuration for containerized environments like Cloud Run
   */
  static async getChromeLauncherFlags(): Promise<string[]> {
    return [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-zygote',
      '--single-process',
      // Let Chrome Launcher handle the remote debugging port allocation
      // '--remote-debugging-port=9222' removed to avoid port conflicts
      // Additional stability flags for containers
      '--disable-extensions',
      '--disable-default-apps',
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-sync'
    ];
  }
}
