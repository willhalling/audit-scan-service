import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export class PuppeteerConfig {
  /**
   * Get simple Puppeteer launch options that work in both local and Cloud Run
   */
  static async getLaunchOptions(): Promise<any> {
    const isCloudRun = !!process.env.K_SERVICE;
    
    // Create unique userDataDir for each browser launch to prevent conflicts
    const userDataDir = join(tmpdir(), `chrome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    
    return {
      headless: true,
      userDataDir, // Critical: unique directory prevents zombie processes
      executablePath: isCloudRun ? '/usr/bin/chromium' : this.findLocalChrome(),
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-zygote',
        '--single-process',
        '--headless=new'
      ]
    };
  }

  /**
   * Find Chrome on local machine
   */
  private static findLocalChrome(): string {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
      '/usr/bin/google-chrome-stable', // Linux
      '/usr/bin/google-chrome'         // Linux
    ];

    for (const path of chromePaths) {
      if (existsSync(path)) return path;
    }
    
    throw new Error('Chrome not found. Install Chrome or set PUPPETEER_EXECUTABLE_PATH.');
  }

  /**
   * Kill any leftover Chrome processes before launching new browser
   */
  static async forceCleanup(): Promise<void> {
    try {
      console.log('🧹 Force cleaning up browser processes...');
      const { exec } = require('child_process');
      
      await new Promise<void>((resolve) => {
        exec('pkill -f "chrome|chromium" || true', () => resolve());
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('🧹 Cleanup complete');
    } catch (error) {
      console.log('⚠️ Some processes could not be killed (this is usually fine)');
    }
  }

  // Legacy compatibility methods
  static async getChromePath(): Promise<string> {
    const config = await this.getLaunchOptions();
    return config.executablePath;
  }

  static async getChromeLauncherFlags(): Promise<string[]> {
    const config = await this.getLaunchOptions();
    return config.args;
  }
}