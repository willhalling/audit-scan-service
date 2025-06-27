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
      timeout: 120000,
      args: this.getSystemChromiumArgs(),
      executablePath: executablePath
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
      timeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    };

    // Try to use system chromium
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    return launchOptions;
  }

  /**
   * Get system Chromium arguments optimized for Cloud Run
   */
  private static getSystemChromiumArgs(): string[] {
    return [
      // Essential flags for containerized environments
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // Stability flags
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      
      // Performance flags
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--run-all-compositor-stages-before-draw',
      
      // Memory management
      '--memory-pressure-off',
      '--max_old_space_size=4096'
    ];
  }

  /**
   * Get Chrome launcher flags for Lighthouse
   * These flags are specifically tuned for Chrome Launcher in containerized environments
   */
  static async getChromeLauncherFlags(): Promise<string[]> {
    return [
      // Essential flags for containerized environments
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // Network and debugging flags for Chrome Launcher
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--remote-debugging-address=0.0.0.0',
      '--remote-debugging-port=0', // Let Chrome choose an available port
      '--disable-gpu',
      '--disable-software-rasterizer',
      
      // Stability flags
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      
      // Performance flags
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--run-all-compositor-stages-before-draw',
      
      // Memory management
      '--memory-pressure-off',
      '--max_old_space_size=4096',
      
      // Additional flags for better containerized Chrome debugging
      '--disable-background-networking',
      '--disable-background-mode',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--no-pings',
      '--password-store=basic',
      '--use-mock-keychain'
    ];
  }
}
