import { existsSync } from 'fs';
import puppeteer from 'puppeteer-core';

export class PuppeteerConfig {
  /**
   * Get optimized Puppeteer launch options for production environments
   * Uses system Chromium for maximum compatibility
   */
  static async getLaunchOptions(): Promise<any> {
    const isProduction = process.env.NODE_ENV === 'production';
    const isCloudRun = !!process.env.K_SERVICE; // Cloud Run sets this environment variable
    const isContainer = !!process.env.KUBERNETES_SERVICE_HOST || !!process.env.K_SERVICE;
    
    console.log(`🔍 Environment: ${isProduction ? 'production' : 'development'}, Cloud Run: ${isCloudRun}, Container: ${isContainer}`);

    const launchOptions: any = {
      headless: true,
      timeout: 15000, // Reduced timeout - fail faster in containers
      defaultViewport: { width: 1280, height: 720 },
      handleSIGINT: false
    };

    // puppeteer-core always requires an executablePath
    let executablePath: string;
    
    if (isContainer || isCloudRun || (isProduction && process.env.PUPPETEER_EXECUTABLE_PATH)) {
      // Use system Chromium in Cloud Run/production/container environments
      executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
      console.log(`🎯 Container/Production Chromium executable path: ${executablePath}`);
      launchOptions.args = this.getSystemChromiumArgs();
      
      // Verify the executable exists in container environments
      if (!existsSync(executablePath)) {
        console.error(`❌ Chromium not found at ${executablePath}`);
        console.log('📋 Container troubleshooting:');
        console.log('1. Ensure Dockerfile installs chromium');
        console.log('2. Set PUPPETEER_EXECUTABLE_PATH correctly');
        console.log('3. Check if chromium package is available');
        throw new Error(`Chromium executable not found at ${executablePath}. Check Docker container setup.`);
      }
    } else {
      // For local development, try to find Chrome/Chromium
      executablePath = this.findLocalChrome();
      console.log(`🏠 Local Chrome executable path: ${executablePath}`);
      launchOptions.args = this.getLocalChromiumArgs();
    }
    
    launchOptions.executablePath = executablePath;
    console.log(`🚀 Final launch config: executablePath=${executablePath}, args=${JSON.stringify(launchOptions.args)}`);
    return launchOptions;
  }

  /**
   * Find Chrome executable on local machine
   */
  private static findLocalChrome(): string {
    // Check if environment variable is set
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    // Try common Chrome locations for macOS
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ];
    
    // Use synchronous fs check
    for (const path of macPaths) {
      try {
        if (existsSync(path)) {
          console.log(`✅ Found Chrome at: ${path}`);
          return path;
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    // If no Chrome found, throw an error with helpful message
    throw new Error(`Chrome/Chromium not found. Please install Chrome or set PUPPETEER_EXECUTABLE_PATH environment variable.
Tried paths:
${macPaths.join('\n')}

To fix this, either:
1. Install Google Chrome from https://www.google.com/chrome/
2. Set PUPPETEER_EXECUTABLE_PATH environment variable to your Chrome path`);
  }

  /**
   * Get alternative launch options for fallback
   */
  static async getAlternativeLaunchOptions(): Promise<any> {
    console.log('🔄 Using minimal Chromium configuration');
    const launchOptions: any = {
      headless: true,
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
      '--disable-dev-shm-usage',       // fixes /dev/shm too small issue
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--no-sandbox',
      '--no-zygote',
      '--single-process',
      '--headless=new',                // 👈 especially important for newer Chrome
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--no-first-run',
      '--memory-pressure-off',         // Disable memory pressure checks
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=VizDisplayCompositor'
    ];
  }

  /**
   * Get local Chromium arguments for development
   * More permissive flags for local development
   */
  private static getLocalChromiumArgs(): string[] {
    return [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox'
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

  /**
   * Get the Chrome executable path for the current environment
   */
  static async getChromePath(): Promise<string> {
    const isProduction = process.env.NODE_ENV === 'production';
    const isCloudRun = !!process.env.K_SERVICE;
    
    if (isCloudRun || isProduction) {
      return process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    } else {
      return this.findLocalChrome();
    }
  }

  /**
   * Test if Chromium can actually launch (diagnostic method)
   */
  static async testChromiumLaunch(): Promise<{ success: boolean; error?: string; path?: string }> {
    try {
      const config = await this.getLaunchOptions();
      console.log(`🧪 Testing Chromium launch with path: ${config.executablePath}`);
      
      const browser = await puppeteer.launch({
        ...config,
        timeout: 10000 // Shorter timeout for testing
      });
      
      await browser.close();
      return { 
        success: true, 
        path: config.executablePath 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        path: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'
      };
    }
  }

  /**
   * Aggressively clean up any leftover Chrome/Chromium processes
   */
  static async forceCleanupBrowsers(): Promise<void> {
    try {
      console.log('🧹 Force cleaning up browser processes...');
      
      // Kill any leftover chromium processes
      const { exec } = await import('child_process');
      
      await new Promise<void>((resolve) => {
        exec('pkill -f chromium || pkill -f chrome || true', (error) => {
          if (error) {
            console.log('⚠️ Some processes could not be killed (this is usually fine)');
          } else {
            console.log('✅ Browser processes cleaned up');
          }
          resolve();
        });
      });

      // Wait a moment for processes to actually die
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to clean up shared memory
      await new Promise<void>((resolve) => {
        exec('rm -rf /tmp/.org.chromium.* 2>/dev/null || true', () => resolve());
      });

      console.log('🧹 Cleanup complete');
    } catch (error) {
      console.log('⚠️ Cleanup failed, but continuing:', error);
    }
  }
}
