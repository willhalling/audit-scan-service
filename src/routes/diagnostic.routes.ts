import { Router, Request, Response } from 'express';
import puppeteer from 'puppeteer-core';
import * as chromeLauncher from 'chrome-launcher';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';

const router = Router();

/**
 * Basic connectivity test - no browser involved
 */
router.get('/ping', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Service is running',
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
      CHROME_PATH: process.env.CHROME_PATH,
      platform: process.platform,
      nodeVersion: process.version
    }
  });
});

/**
 * Diagnostic endpoint to test browser launching capabilities
 * This helps debug browser launch issues in production environments
 */
router.get('/browser-test', async (req: Request, res: Response) => {
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
      CHROME_PATH: process.env.CHROME_PATH,
      platform: process.platform,
      nodeVersion: process.version
    },
    tests: {}
  };

  try {
    // Test 1: Check if Chrome executable exists
    console.log('🔍 Testing Chrome executable...');
    results.tests.chromeExecutable = {
      path: process.env.PUPPETEER_EXECUTABLE_PATH || 'default',
      exists: false,
      error: null
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      const fs = await import('fs');
      try {
        const exists = fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH);
        results.tests.chromeExecutable.exists = exists;
        if (exists) {
          const stats = fs.statSync(process.env.PUPPETEER_EXECUTABLE_PATH);
          results.tests.chromeExecutable.permissions = {
            readable: !!(stats.mode & parseInt('444', 8)),
            executable: !!(stats.mode & parseInt('111', 8))
          };
        }
      } catch (error) {
        results.tests.chromeExecutable.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    // Test 2: Try launching Puppeteer
    console.log('🔍 Testing Puppeteer launch...');
    results.tests.puppeteerLaunch = {
      success: false,
      timeout: false,
      error: null,
      duration: 0
    };

    const puppeteerStartTime = Date.now();
    try {
      const browser = await Promise.race([
        puppeteer.launch({
          ...(await PuppeteerConfig.getLaunchOptions()),
          timeout: 60000 // Increased timeout for production
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Launch timeout after 60 seconds')), 60000)
        )
      ]) as any;

      results.tests.puppeteerLaunch.success = true;
      results.tests.puppeteerLaunch.duration = Date.now() - puppeteerStartTime;
      
      // Test basic functionality
      const page = await browser.newPage();
      await page.goto('data:text/html,<h1>Test</h1>', { waitUntil: 'domcontentloaded' });
      const title = await page.title();
      results.tests.puppeteerLaunch.basicTest = { title, success: true };
      
      await browser.close();
    } catch (error) {
      results.tests.puppeteerLaunch.duration = Date.now() - puppeteerStartTime;
      results.tests.puppeteerLaunch.error = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error && error.message.includes('timeout')) {
        results.tests.puppeteerLaunch.timeout = true;
      }
    }

    // Test 3: Try launching Chrome Launcher
    console.log('🔍 Testing Chrome Launcher...');
    results.tests.chromeLauncher = {
      success: false,
      timeout: false,
      error: null,
      duration: 0
    };

    const chromeStartTime = Date.now();
    try {
      const chrome = await Promise.race([
        chromeLauncher.launch({ 
          chromeFlags: await PuppeteerConfig.getChromeLauncherFlags(),
          chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
          startingUrl: 'about:blank'
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Chrome launcher timeout after 60 seconds')), 60000)
        )
      ]) as any;

      results.tests.chromeLauncher.success = true;
      results.tests.chromeLauncher.duration = Date.now() - chromeStartTime;
      results.tests.chromeLauncher.port = chrome.port;
      
      await chrome.kill();
    } catch (error) {
      results.tests.chromeLauncher.duration = Date.now() - chromeStartTime;
      results.tests.chromeLauncher.error = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error && error.message.includes('timeout')) {
        results.tests.chromeLauncher.timeout = true;
      }
    }

    console.log('✅ Browser diagnostic tests completed');
    res.json(results);

  } catch (error) {
    console.error('❌ Browser diagnostic test failed:', error);
    results.tests.generalError = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json(results);
  }
});

/**
 * Quick browser health check
 */
router.get('/browser-health', async (req: Request, res: Response) => {
  // Set a response timeout
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        status: 'timeout',
        message: 'Browser health check timed out after 10 seconds',
        timestamp: new Date().toISOString()
      });
    }
  }, 10000);

  try {
    console.log('🔍 Starting browser health check...');
    
    const browser = await Promise.race([
      puppeteer.launch({
        ...(await PuppeteerConfig.getLaunchOptions()),
        timeout: 8000 // Very short timeout
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Launch timeout after 8 seconds')), 8000)
      )
    ]) as any;
    
    console.log('✅ Browser launched successfully');
    await browser.close();
    console.log('✅ Browser closed successfully');
    
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.json({
        status: 'ok',
        message: 'Browser launched and closed successfully',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Browser health check failed:', error);
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        details: {
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined
        }
      });
    }
  }
});

export default router;
