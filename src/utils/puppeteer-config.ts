import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import chromium from '@sparticuz/chromium';

export class PuppeteerConfig {
  /**
   * Get simple Puppeteer launch options that work in both local and container
   * deployments (Docker / RunPod / Cloud Run).
   */
  static async getLaunchOptions(): Promise<any> {
    // K_SERVICE is set by Google Cloud Run. When running in other containers
    // (e.g. RunPod) we rely on PUPPETEER_EXECUTABLE_PATH being set instead.
    const isCloudRun = !!process.env.K_SERVICE;
    
    // Create unique userDataDir for each browser launch to prevent conflicts
    const userDataDir = join(tmpdir(), `chrome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    
    // Use @sparticuz/chromium for better stability
    const executablePath = isCloudRun 
      ? await chromium.executablePath()
      : this.findLocalChrome();
    
    const config = {
      headless: true,
      timeout: 90000, // Increase timeout even more for debugging
      pipe: true, // CRITICAL: Use pipe instead of WebSocket - fixes WS endpoint timeout
      userDataDir, // Critical: unique directory prevents zombie processes
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        
        // Aggressive GPU/WebGL disabling
        '--disable-gpu',
        '--disable-gpu-sandbox',
        '--disable-gpu-compositing',
        '--disable-gpu-rasterization',
        '--disable-software-rasterizer',
        '--use-gl=disabled',
        '--disable-webgl',
        '--disable-webgl2',
        '--disable-3d-apis',
        '--blacklist-accelerated-compositing',
        '--blacklist-webgl',
        
        // Memory and process isolation
        '--no-zygote',
        '--single-process',
        '--memory-pressure-off',
        '--max_old_space_size=4096',
        '--disable-ipc-flooding-protection',
        '--js-flags=--max-old-space-size=4096',
        
        // Additional crash prevention
        '--disable-crash-reporter',
        '--disable-breakpad',
        '--disable-logging',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-domain-reliability',
        
        // Browser optimization
        '--headless=new',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor,HttpsFirstBalancedModeAutoEnable,AudioServiceOutOfProcess',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--no-first-run',
        '--disable-notifications',
        '--disable-component-extensions-with-background-pages',
        '--disable-client-side-phishing-detection',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--safebrowsing-disable-auto-update',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list'
      ]
    };
    
    console.log(`🔧 Puppeteer config created with pipe=${config.pipe}, timeout=${config.timeout}`);
    console.log(`🎯 Using Chrome executable: ${config.executablePath}`);
    console.log(`📋 Chrome args: ${config.args.join(' ')}`);
    return config;
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
   * Kill leftover Chrome processes from previous runs.
   *
   * IMPORTANT: this must ONLY be called at worker startup and on shutdown.
   * Calling it while audits are running kills browsers belonging to
   * in-flight screenshots/sessions (parallel captures used to kill each
   * other this way).
   */
  static async killStaleChromeProcesses(): Promise<void> {
    try {
      console.log('🧹 Killing stale browser processes...');
      const { exec } = await import('child_process');

      await new Promise<void>((resolve) => {
        exec('pkill -f "chrome|chromium" || true', () => resolve());
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('🧹 Stale browser cleanup complete');
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