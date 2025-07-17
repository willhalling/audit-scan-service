import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import UserAgent from 'user-agents';
import pRetry from 'p-retry';
import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;

// Constants from original scrape logic
const MAX_PAGES = 5;
const EXCLUDED_LINKS = ['cdn-cgi', 'tel:', 'request_format~json', 'get-started-risk-free', 'mailto:', 'ms-windows-store', 'linkedin', 'javascript: void(0)', 'twitter', 'redirect'];
const EXCLUDED_PAGES = ['cdn-cgi', 'sign-in', 'login', 'log-in', 'register', 'sign-up', 'signup', 'privacy', 'cookie', 'terms', 'cart', 'checkout', 'mailto:', 'customer_authentication', 'redirect'];
const CTAS = [
  'buy', 'subscribe', 'sign up', 'get started', 'learn more', 'join', 'with us', 'get in touch', 'our services',
  'contact us', 'download', 'free trial', 'register', 'book now', 'order now', 'shop now', 'view more', 'read more',
  'discover', 'explore', 'watch now', 'try now', 'apply now', 'donate', 'support', 'reserve', 'schedule', 'find out more',
  'get quote', 'request demo', 'start free trial', 'claim offer', 'see plans', 'view pricing', 'get discount', 'limited time offer',
  'sign in', 'log in', 'create account', 'join now', 'become a member', 'upgrade', 'renew', 'activate', 'start now', 'enroll',
  'get access', 'view details', 'see more', 'continue', 'proceed', 'next', 'back', 'finish', 'complete', 'submit', 'send', 'contact',
  'follow us', 'like us', 'share', 'tweet', 'pin it', 'connect', 'join the conversation', 'join the community', 'join the club'
];

// Helper functions from original logic
const generateRandomUserAgent = () => {
  return new UserAgent({ deviceCategory: 'desktop' }).toString();
};

const generateHeaders = () => ({
  'User-Agent': generateRandomUserAgent(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
  'DNT': '1',
  'Referer': 'https://www.google.com',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
});

function analyzeCTAs($) {
  return $('a, button').filter((_, el) =>
    CTAS.some(cta => $(el).text().toLowerCase().includes(cta.toLowerCase()))
  ).map((_, el) => $(el).text().trim()).get().slice(0, 10);
}

function analyzeForms($) {
  return $('form').map((_, el) => ({
    inputs: $(el).find('input, select, textarea').length,
    requiredFields: $(el).find('[required]').length,
    buttons: $(el).find('button, input[type=\"submit\"]').length
  })).get();
}

function analyzeSocials(links) {
  const socialPlatforms = {
    x: false,
    facebook: false,
    linkedin: false,
    instagram: false,
    tiktok: false,
    youtube: false,
    pinterest: false,
    missingSocials: []
  };

  links.forEach(link => {
    if (link.includes('x.com')) socialPlatforms.x = true;
    if (link.includes('facebook.com')) socialPlatforms.facebook = true;
    if (link.includes('linkedin.com')) socialPlatforms.linkedin = true;
    if (link.includes('instagram.com')) socialPlatforms.instagram = true;
    if (link.includes('tiktok.com')) socialPlatforms.tiktok = true;
    if (link.includes('youtube.com')) socialPlatforms.youtube = true;
    if (link.includes('pinterest.com')) socialPlatforms.pinterest = true;
  });

  socialPlatforms.missingSocials = Object.keys(socialPlatforms).filter(platform => !socialPlatforms[platform]);
  return socialPlatforms;
}

async function validateLinks(links, baseUrl) {
  const linksToValidate = links
    .filter(link => !link.startsWith('#') && !link.includes('/#'))
    .slice(0, 10);

  const results = { broken: [], valid: [], brokenExamples: [] };
  const checkLinkPromises = linksToValidate.map(link => {
    const absoluteLink = link.startsWith('http') ? link : new URL(link, baseUrl).href;
    return axios.head(absoluteLink, { timeout: 5000 })
      .then(() => results.valid.push(absoluteLink))
      .catch(() => {
        if (!EXCLUDED_LINKS.some(excluded => absoluteLink.includes(excluded))) {
          results.broken.push(absoluteLink);
          if (absoluteLink && results.brokenExamples.length < 1) {
            results.brokenExamples.push(absoluteLink);
          }
        }
      });
  });

  await Promise.all(checkLinkPromises);
  return results;
}

// Lighthouse endpoint
app.post('/lighthouse', async (req, res) => {
  const { url, strategy, useDesktop } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Handle both parameter formats: strategy OR useDesktop
  const isDesktop = strategy === 'desktop' || useDesktop === true || strategy === undefined;
  const cleanUrl = url.startsWith('http') ? url : `https://${url}`;

  console.log(`🔍 POST Lighthouse scan request for ${isDesktop ? 'desktop' : 'mobile'}:`, cleanUrl);

  let chrome;
  try {
    // Launch Chrome using chrome-launcher with comprehensive flags
    chrome = await chromeLauncher.launch({
      chromeFlags: [
        '--headless',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--enable-features=NetworkService,NetworkServiceLogging',
        '--force-color-profile=srgb',
        '--memory-pressure-off',
        '--max_old_space_size=4096'
      ]
    });

    // Wait for Chrome to be fully ready
    console.log('⏳ Waiting for Chrome to initialize...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test Chrome connection before proceeding
    try {
      const response = await axios.get(`http://localhost:${chrome.port}/json/version`, { timeout: 5000 });
      console.log('✅ Chrome connection verified:', response.data.Browser);
    } catch (chromeTestError) {
      throw new Error(`Chrome connection failed: ${chromeTestError.message}`);
    }

    console.log('🚀 Running Lighthouse analysis...');
    const { lhr } = await lighthouse(cleanUrl, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      logLevel: 'info',
      disableStorageReset: false,
      // Add these settings to prevent the performance mark error
      settings: {
        maxWaitForFcp: 30 * 1000, // 30 seconds
        maxWaitForLoad: 45 * 1000, // 45 seconds
        pauseAfterFcpMs: 1000,
        pauseAfterLoadMs: 1000,
        networkQuietThresholdMs: 1000,
        cpuQuietThresholdMs: 1000,
        formFactor: isDesktop ? 'desktop' : 'mobile',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0
        },
        screenEmulation: {
          mobile: !isDesktop,
          width: isDesktop ? 1350 : 375,
          height: isDesktop ? 940 : 667,
          deviceScaleFactor: isDesktop ? 1 : 2,
          disabled: false
        },
        emulatedUserAgent: isDesktop
          ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          : 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      }
    });

    const result = {
      performance: Math.round((lhr.categories.performance?.score || 0) * 100),
      accessibility: Math.round((lhr.categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((lhr.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((lhr.categories.seo?.score || 0) * 100),
      audits: lhr.audits,
      coreWebVitals: {
        firstContentfulPaint: lhr.audits['first-contentful-paint']?.numericValue || 0,
        largestContentfulPaint: lhr.audits['largest-contentful-paint']?.numericValue || 0,
        cumulativeLayoutShift: lhr.audits['cumulative-layout-shift']?.numericValue || 0,
        firstInputDelay: lhr.audits['first-input-delay']?.numericValue || 0,
        totalBlockingTime: lhr.audits['total-blocking-time']?.numericValue || 0,
      },
      url: cleanUrl,
      strategy: isDesktop ? 'desktop' : 'mobile',
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Lighthouse analysis completed for ${isDesktop ? 'desktop' : 'mobile'}`);
    res.json(result);
  } catch (error) {
    console.error('❌ Lighthouse analysis failed:', error);
    res.status(500).json({
      error: 'Lighthouse analysis failed',
      message: error.message
    });
  } finally {
    if (chrome) {
      await chrome.kill();
    }
  }
});

// Lighthouse endpoint
app.get('/lighthouse', async (req, res) => {
  const { host, uid, docId } = req.query;

  console.log('🔍 Lighthouse scan request:', { host, uid, docId });

  if (!host) {
    return res.status(400).json({ received: false, error: 'No website URL provided' });
  }

  if (!uid || !docId) {
    return res.status(400).json({ error: 'UID and document ID are required' });
  }

  let chrome;
  const timeoutMs = 120000; // 2 minutes timeout

  try {
    console.log('✅ Starting Lighthouse scan for:', host);

    const url = host.startsWith('http') ? host : `https://${host}`;
    console.log('🚀 Running Lighthouse on:', url);    // Wrap the entire operation in a timeout
    const lighthouseOperation = async () => {
      // Launch Chrome using chrome-launcher with comprehensive flags
      chrome = await chromeLauncher.launch({
        chromeFlags: [
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--enable-features=NetworkService,NetworkServiceLogging',
          '--force-color-profile=srgb',
          '--memory-pressure-off',
          '--max_old_space_size=4096'
        ]
      });

      // Wait for Chrome to be fully ready
      console.log('⏳ Waiting for Chrome to initialize...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test Chrome connection before proceeding
      try {
        const response = await axios.get(`http://localhost:${chrome.port}/json/version`, { timeout: 5000 });
        console.log('✅ Chrome connection verified:', response.data.Browser);
      } catch (chromeTestError) {
        throw new Error(`Chrome connection failed: ${chromeTestError.message}`);
      }

      // Add retry logic for Lighthouse execution
      const lighthouseResult = await pRetry(async () => {
        console.log('🔄 Attempting Lighthouse scan...');

        // Additional wait before starting Lighthouse
        await new Promise(resolve => setTimeout(resolve, 1000));

        return await lighthouse(url, {
          port: chrome.port,
          output: 'json',
          logLevel: 'info',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
          // Add these settings to prevent the performance mark error
          settings: {
            maxWaitForFcp: 30 * 1000, // 30 seconds
            maxWaitForLoad: 45 * 1000, // 45 seconds
            pauseAfterFcpMs: 1000,
            pauseAfterLoadMs: 1000,
            networkQuietThresholdMs: 1000,
            cpuQuietThresholdMs: 1000,
            formFactor: 'desktop',
            throttling: {
              rttMs: 40,
              throughputKbps: 10240,
              cpuSlowdownMultiplier: 1,
              requestLatencyMs: 0,
              downloadThroughputKbps: 0,
              uploadThroughputKbps: 0
            },
            screenEmulation: {
              mobile: false,
              width: 1350,
              height: 940,
              deviceScaleFactor: 1,
              disabled: false
            },
            emulatedUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
      }, {
        retries: 2,
        minTimeout: 3000,
        onFailedAttempt: (error) => {
          console.warn(`Lighthouse attempt ${error.attemptNumber} failed:`, error.message);
          if (error.attemptNumber < 3) {
            console.log('🔄 Retrying Lighthouse scan...');
          }
        }
      });

      return lighthouseResult;
    };

    // Execute with timeout
    const lighthouseResult = await Promise.race([
      lighthouseOperation(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Lighthouse scan timed out after 2 minutes')), timeoutMs)
      )
    ]);

    // Close Chrome instance after Lighthouse scan
    await chrome.kill();

    const lighthouseData = {
      performance: {
        score: Math.round(lighthouseResult.lhr.categories.performance.score * 100),
        metrics: {
          firstContentfulPaint: lighthouseResult.lhr.audits['first-contentful-paint']?.displayValue || 'N/A',
          largestContentfulPaint: lighthouseResult.lhr.audits['largest-contentful-paint']?.displayValue || 'N/A',
          cumulativeLayoutShift: lighthouseResult.lhr.audits['cumulative-layout-shift']?.displayValue || 'N/A',
          speedIndex: lighthouseResult.lhr.audits['speed-index']?.displayValue || 'N/A',
          totalBlockingTime: lighthouseResult.lhr.audits['total-blocking-time']?.displayValue || 'N/A'
        }
      },
      accessibility: {
        score: Math.round(lighthouseResult.lhr.categories.accessibility.score * 100)
      },
      bestPractices: {
        score: Math.round(lighthouseResult.lhr.categories['best-practices'].score * 100)
      },
      seo: {
        score: Math.round(lighthouseResult.lhr.categories.seo.score * 100)
      },
      pwa: {
        score: Math.round((lighthouseResult.lhr.categories.pwa?.score || 0) * 100)
      }
    };

    console.log('🎉 Lighthouse scan completed successfully!');
    res.json({
      success: true,
      lighthouse: lighthouseData,
      url,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 LIGHTHOUSE SCAN FATAL ERROR:', error);

    // Enhanced Chrome cleanup
    if (chrome) {
      try {
        console.log('🧹 Cleaning up Chrome process...');
        await Promise.race([
          chrome.kill(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Chrome kill timeout')), 5000))
        ]);
        console.log('✅ Chrome process cleaned up successfully');
      } catch (closeError) {
        console.error('❌ Failed to close Chrome after error:', closeError);
        // Force kill Chrome processes if normal cleanup fails
        try {
          const { exec } = await import('child_process');
          exec('pkill -f chrome', (err) => {
            if (err) console.warn('Failed to force kill Chrome processes:', err);
            else console.log('🔧 Force killed Chrome processes');
          });
        } catch (forceKillError) {
          console.error('❌ Failed to force kill Chrome:', forceKillError);
        }
      }
    }

    // Provide more specific error messages
    let errorMessage = error.message;
    let errorCode = 'LIGHTHOUSE_ERROR';

    if (error.message.includes('performance mark has not been set')) {
      errorMessage = 'Lighthouse navigation failed - the page may be taking too long to load or Chrome encountered an issue';
      errorCode = 'NAVIGATION_TIMEOUT';
    } else if (error.message.includes('TIMEOUT')) {
      errorMessage = 'Lighthouse scan timed out - the page may be slow or unresponsive';
      errorCode = 'SCAN_TIMEOUT';
    } else if (error.message.includes('ERR_NAME_NOT_RESOLVED')) {
      errorMessage = 'Cannot reach the website - please check the URL is correct';
      errorCode = 'DNS_ERROR';
    } else if (error.message.includes('ERR_CONNECTION_REFUSED')) {
      errorMessage = 'Connection refused - the website may be down or blocking requests';
      errorCode = 'CONNECTION_REFUSED';
    }

    res.status(500).json({
      error: errorMessage,
      code: errorCode,
      originalError: error.message,
      step: 'lighthouse_scan',
      timestamp: new Date().toISOString()
    });
  }
});

// Scrape endpoint  
app.get('/scrape', async (req, res) => {
  const { host, uid, docId, mode = 'full', customSubpages } = req.query;

  console.log('🚀 Website scraping request:', { host, uid, docId, mode });

  if (!host) {
    return res.status(400).json({ received: false, error: 'No website URL provided' });
  }

  try {
    const url = host.startsWith('http') ? host : `https://${host}`;
    console.log('🚀 Starting website scraping for:', url);

    // Parse custom subpages if provided
    let subpagesToScan = [];
    if (customSubpages) {
      try {
        subpagesToScan = JSON.parse(customSubpages);
      } catch (e) {
        console.warn('Failed to parse custom subpages:', e);
      }
    }

    const scrapeData = await scrapeWebsiteData(url, mode, subpagesToScan);

    console.log('🎉 Website scraping completed successfully!');
    res.json({
      success: true,
      received: true,
      ...scrapeData
    });

  } catch (error) {
    console.error('💥 WEBSITE SCRAPING FATAL ERROR:', error);
    res.status(500).json({
      error: error.message,
      step: 'website_scraping',
      timestamp: new Date().toISOString()
    });
  }
});

// Screenshot endpoint
app.get('/screenshot', async (req, res) => {
  const { host, uid, docId, width, height, fullPage } = req.query;

  console.log('📸 Screenshot request:', { host, uid, docId, width, height, fullPage });

  if (!host) {
    return res.status(400).json({ received: false, error: 'No website URL provided' });
  }

  let browser;
  try {
    console.log('✅ Starting screenshot capture for:', host);

    browser = await puppeteer.launch({
      args: ['--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-zygote',
        '--single-process'],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: parseInt(width) || 1366,
      height: parseInt(height) || 768,
    });

    const url = host.startsWith('http') ? host : `https://${host}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const screenshot = await page.screenshot({
      fullPage: fullPage === 'true',
      type: 'png'
    });

    await browser.close();

    console.log('🎉 Screenshot captured successfully!');
    res.json({
      success: true,
      screenshot: screenshot.toString('base64'),
      url,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 SCREENSHOT FATAL ERROR:', error);

    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('❌ Failed to close browser after error:', closeError);
      }
    }

    res.status(500).json({
      error: error.message,
      step: 'screenshot_capture',
      timestamp: new Date().toISOString()
    });
  }
});

// Accessibility scanning endpoint
app.get('/accessibility', async (req, res) => {
  const { host, uid, docId, skipFirestore, screenshotWidth, screenshotHeight, deviceType } = req.query;

  console.log('🔍 Accessibility scan request:', { host, uid, docId, skipFirestore, deviceType });

  if (!host) {
    return res.status(400).json({ received: false, error: 'No website URL provided' });
  }

  if (!uid || !docId) {
    return res.status(400).json({ error: 'UID and document ID are required' });
  }

  let browser;
  try {
    console.log('✅ Starting accessibility scan for:', host);
    console.log('🚀 Step 1: Initializing Puppeteer...');

    // Initialize Puppeteer
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-features=VizDisplayCompositor'],
      headless: true,
    });
    console.log('✅ Step 1 Complete: Puppeteer initialized');

    console.log('🚀 Step 2: Creating new page...');
    const page = await browser.newPage();
    await page.setBypassCSP(true);
    page.setDefaultNavigationTimeout(60000);

    // Extract viewport dimensions
    const viewportWidth = screenshotWidth ? parseInt(screenshotWidth) : 1366;
    const viewportHeight = screenshotHeight ? parseInt(screenshotHeight) : 850;

    // Set viewport size and mobile emulation if needed
    if (deviceType === 'mobile') {
      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2
      });

      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
      console.log(`✅ Step 2 Complete: Mobile page created with viewport ${viewportWidth}x${viewportHeight}`);
    } else {
      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
      });
      console.log(`✅ Step 2 Complete: Desktop page created with viewport ${viewportWidth}x${viewportHeight}`);
    }

    console.log('🚀 Step 3: Navigating to website...');
    const url = host.startsWith('http') ? host : `http://${host}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      console.log('✅ Step 3 Complete: Navigation successful');
    } catch (error) {
      console.error('❌ Step 3 Failed: Navigation error:', error);
      throw new Error(`Navigation failed: ${error.message}`);
    }

    console.log('🚀 Step 4: Injecting axe-core...');
    try {
      // First try to load locally bundled axe-core to bypass CSP
      const fs = require('fs');
      const path = require('path');
      
      try {
        const axeCoreDir = path.resolve(process.cwd(), 'node_modules', 'axe-core');
        let axeCoreScript;
        
        try {
          // Try to load from the main dist file
          const axeCoreMainPath = path.join(axeCoreDir, 'axe.min.js');
          if (fs.existsSync(axeCoreMainPath)) {
            axeCoreScript = fs.readFileSync(axeCoreMainPath, 'utf8');
          } else {
            // Fallback to alternative path
            const axeCoreAltPath = path.join(axeCoreDir, 'dist', 'axe.min.js');
            axeCoreScript = fs.readFileSync(axeCoreAltPath, 'utf8');
          }
          
          await page.addScriptTag({ content: axeCoreScript });
          console.log('✅ Step 4 Complete: Axe-core injected from local package');
          
        } catch (localError) {
          console.warn('Failed to load axe-core from local package, trying CDN fallback...');
          
          try {
            await page.addScriptTag({
              url: 'https://unpkg.com/axe-core@4.7.0/axe.min.js'
            });
            console.log('✅ Step 4 Complete: Axe-core injected from CDN');
          } catch (cdnError) {
            console.warn('CDN failed, trying CSP bypass...');
            
            // Try to temporarily disable CSP and retry
            await page.setBypassCSP(true);
            await page.addScriptTag({
              url: 'https://unpkg.com/axe-core@4.7.0/axe.min.js'
            });
            console.log('✅ Step 4 Complete: Axe-core injected with CSP bypass');
          }
        }
      } catch (allMethodsError) {
        throw allMethodsError;
      }
    } catch (error) {
      console.error('❌ Step 4 Failed: Axe-core injection error:', error);
      throw new Error(`Axe-core injection failed: ${error.message}`);
    }

    console.log('🚀 Step 5: Running accessibility scan...');
    let axeResults;
    try {
      axeResults = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
          if (typeof axe === 'undefined') {
            reject(new Error('Axe-core not loaded'));
            return;
          }

          axe.run(document, {
            tags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']
          }, (err, results) => {
            if (err) {
              reject(err);
            } else {
              resolve(results);
            }
          });
        });
      });
      console.log('✅ Step 5 Complete: Accessibility scan completed');
      console.log(`  - Violations: ${axeResults.violations?.length || 0}`);
      console.log(`  - Passes: ${axeResults.passes?.length || 0}`);
    } catch (error) {
      console.error('❌ Step 5 Failed: Accessibility scan error:', error);
      throw new Error(`Accessibility scan failed: ${error.message}`);
    }

    console.log('🚀 Step 6: Getting element coordinates for annotation...');
    let elementCoordinates = [];

    if (axeResults.violations && axeResults.violations.length > 0) {
      try {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });

        await page.waitForTimeout(500);

        const visualViolations = axeResults.violations.filter((violation) => {
          const skipIds = [
            'document-title', 'html-has-lang', 'meta-viewport',
            'landmark-one-main', 'region', 'page-has-heading-one'
          ];
          return !skipIds.includes(violation.id);
        });

        console.log('📍 Visual violations to process:', visualViolations.length);

        elementCoordinates = await page.evaluate((violations) => {
          const coords = [];

          violations.forEach((violation) => {
            violation.nodes.forEach((node) => {
              const selectors = Array.isArray(node.target) ? node.target : [node.target];
              selectors.forEach((selector) => {
                if (typeof selector === 'string') {
                  try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach((element) => {
                      const rect = element.getBoundingClientRect();
                      if (rect.width > 0 && rect.height > 0) {
                        const absoluteX = rect.left + window.pageXOffset;
                        const absoluteY = rect.top + window.pageYOffset;

                        coords.push({
                          x: absoluteX + rect.width / 2,
                          y: absoluteY + rect.height / 2,
                          width: rect.width,
                          height: rect.height,
                          impact: violation.impact
                        });
                      }
                    });
                  } catch (selectorError) {
                    console.warn('Invalid selector:', selector, selectorError);
                  }
                }
              });
            });
          });

          return coords;
        }, visualViolations || []);

        console.log('✅ Step 6 Complete: Got coordinates for', elementCoordinates.length, 'elements');
      } catch (error) {
        console.error('❌ Step 6 Failed: Coordinate extraction error:', error);
        elementCoordinates = [];
      }
    }

    console.log('🚀 Step 7: Taking screenshots...');
    let fullPageScreenshot;
    let topPortionScreenshot;
    try {
      fullPageScreenshot = await page.screenshot({
        fullPage: true,
        type: 'png'
      });

      let screenshotHeight;
      if (deviceType === 'mobile') {
        const pdfRedBoxAspectRatio = 0.4012;
        screenshotHeight = Math.floor(viewportWidth / pdfRedBoxAspectRatio);
      } else {
        screenshotHeight = Math.floor(viewportWidth * 0.65);
      }

      topPortionScreenshot = await page.screenshot({
        fullPage: false,
        clip: {
          x: 0,
          y: 0,
          width: viewportWidth,
          height: screenshotHeight
        },
        type: 'png'
      });
      console.log('✅ Step 7 Complete: Both screenshots taken');
    } catch (error) {
      console.error('❌ Step 7 Failed: Screenshot error:', error);
      throw new Error(`Screenshot failed: ${error.message}`);
    }

    console.log('🚀 Step 8: Closing browser...');
    await browser.close();
    console.log('✅ Step 8 Complete: Browser closed');

    console.log('🚀 Step 9: Annotating screenshots...');
    let annotatedTopPortionScreenshot;
    let annotatedFullPageScreenshot;
    try {
      annotatedTopPortionScreenshot = await annotateScreenshot(topPortionScreenshot, axeResults.violations || [], elementCoordinates);
      annotatedFullPageScreenshot = await annotateScreenshot(fullPageScreenshot, axeResults.violations || [], elementCoordinates);
      console.log('✅ Step 9 Complete: Both screenshots annotated');
    } catch (error) {
      console.error('❌ Step 9 Failed: Screenshot annotation error:', error);
      annotatedTopPortionScreenshot = topPortionScreenshot;
      annotatedFullPageScreenshot = fullPageScreenshot;
    }

    console.log('🚀 Step 10: Calculating accessibility score...');
    const summary = calculateAccessibilityScore(axeResults);
    console.log('✅ Step 10 Complete: Accessibility score calculated:', summary.score);

    const accessibilityData = {
      violations: axeResults.violations || [],
      annotatedScreenshot: annotatedTopPortionScreenshot.toString('base64'),
      fullPageScreenshot: annotatedFullPageScreenshot.toString('base64'),
      url,
      timestamp: new Date().toISOString(),
      summary
    };

    console.log('🎉 Accessibility scan completed successfully!');
    res.json({
      success: true,
      ...accessibilityData
    });

  } catch (error) {
    console.error('💥 ACCESSIBILITY SCAN FATAL ERROR:', error);

    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('❌ Failed to close browser after error:', closeError);
      }
    }

    res.status(500).json({
      error: error.message,
      step: 'accessibility_scan',
      timestamp: new Date().toISOString()
    });
  }
});

// Main scraping function that handles the full website analysis
async function scrapeWebsiteData(url, mode = 'full', customSubpages = []) {
  console.log('🔍 Starting comprehensive website scraping:', { url, mode });

  const scrapeHeaders = generateHeaders();
  const response = await axios.get(url, { headers: scrapeHeaders, timeout: 30000 });
  const $ = cheerio.load(response.data);

  // Extract basic page info
  const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content') || '';
  const keywords = $('meta[name="keywords"]').attr('content') || '';
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const language = $('html').attr('lang') || '';
  const robotsMeta = $('meta[name="robots"]').attr('content') || '';
  const hasViewportMetaTag = $('meta[name="viewport"]').length > 0;

  // Extract links
  const links = $('a[href]').map((_, el) => $(el).attr('href')).get();

  // Extract images
  const images = $('img').map((_, el) => ({
    src: $(el).attr('src') || '',
    alt: $(el).attr('alt') || ''
  })).get();

  // Analyze CTAs, forms, and social presence
  const ctas = analyzeCTAs($);
  const forms = analyzeForms($);
  const socialAnalysis = analyzeSocials(links);

  // Get page text for analysis
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').length;
  const htmlLength = response.data.length;
  const textToHtmlRatio = ((bodyText.length / htmlLength) * 100).toFixed(2);

  // Basic accessibility analysis
  const accessibility = {
    imagesWithoutAlt: images.filter(img => !img.alt).length,
    totalImages: images.length,
    headings: {
      h1: $('h1').length,
      h2: $('h2').length,
      h3: $('h3').length,
      h4: $('h4').length,
      h5: $('h5').length,
      h6: $('h6').length
    }
  };

  // Security analysis
  const security = {
    hasHttps: url.startsWith('https'),
    hasSecurityHeaders: {
      contentSecurityPolicy: response.headers['content-security-policy'] ? true : false,
      strictTransportSecurity: response.headers['strict-transport-security'] ? true : false,
      xFrameOptions: response.headers['x-frame-options'] ? true : false,
      xContentTypeOptions: response.headers['x-content-type-options'] ? true : false
    }
  };

  // Issues detection
  const issues = [];
  if (!title) issues.push('Missing page title');
  if (!description) issues.push('Missing meta description');
  if (!hasViewportMetaTag) issues.push('Missing viewport meta tag');
  if (accessibility.imagesWithoutAlt > 0) {
    issues.push(`${accessibility.imagesWithoutAlt} images without alt text`);
  }
  if (!security.hasHttps) issues.push('Site not using HTTPS');

  // Link validation
  const linkValidation = await validateLinks(links.slice(0, 10), url);

  // Handle different scan modes
  let pages = [];
  if (mode === 'full' || mode === 'custom') {
    let urlsToScan = [];

    if (mode === 'custom' && customSubpages && customSubpages.length > 0) {
      urlsToScan = customSubpages.map(page => page.startsWith('http') ? page : new URL(page, url).href);
    } else {
      // Extract internal URLs for full scan
      const baseUrl = new URL(url);
      const internalLinks = links
        .filter(link => {
          try {
            const linkUrl = new URL(link, url);
            return linkUrl.hostname === baseUrl.hostname &&
              !EXCLUDED_PAGES.some(excluded => link.toLowerCase().includes(excluded));
          } catch {
            return false;
          }
        })
        .slice(0, MAX_PAGES - 1); // -1 because we already have the main page

      urlsToScan = internalLinks.map(link => new URL(link, url).href);
    }

    // Scan additional pages
    for (const pageUrl of urlsToScan) {
      try {
        const pageResponse = await axios.get(pageUrl, { headers: scrapeHeaders, timeout: 30000 });
        const page$ = cheerio.load(pageResponse.data);

        pages.push({
          url: pageUrl,
          title: page$('title').text().trim(),
          description: page$('meta[name="description"]').attr('content') || '',
          wordCount: page$('body').text().replace(/\s+/g, ' ').trim().split(' ').length,
          headings: {
            h1: page$('h1').length,
            h2: page$('h2').length,
            h3: page$('h3').length
          }
        });
      } catch (error) {
        console.warn(`Failed to scan page ${pageUrl}:`, error.message);
      }
    }
  }

  return {
    url,
    title,
    description,
    keywords,
    canonical,
    language,
    robotsMeta,
    isRobotsDoFollow: !robotsMeta.includes('nofollow'),
    hasViewportMetaTag,
    links,
    images,
    accessibility,
    security,
    socialAnalysis,
    wordCount,
    textToHtmlRatio,
    issues,
    brokenLinks: linkValidation.broken,
    brokenLinkExamples: linkValidation.brokenExamples,
    ctas,
    forms,
    bodyText: bodyText.substring(0, 3000),
    pages,
    scannedAt: new Date().toISOString()
  };
}

// Helper functions for accessibility scanning
async function annotateScreenshot(screenshot, violations, elementCoordinates = []) {
  try {
    console.log('📸 Starting screenshot annotation');
    console.log('📸 Violations to annotate:', violations.length);
    console.log('📸 Element coordinates available:', elementCoordinates.length);

    const image = sharp(screenshot);
    const { width, height } = await image.metadata();

    if (!width || !height) {
      throw new Error('Could not get image dimensions');
    }

    if (violations.length === 0 || elementCoordinates.length === 0) {
      console.log('📸 No violations/coordinates to annotate, returning original screenshot');
      return screenshot;
    }

    const safeElementCoordinates = elementCoordinates.filter(coord => {
      return (
        Number.isFinite(coord.x) && Number.isFinite(coord.y) &&
        Number.isFinite(coord.width) && Number.isFinite(coord.height) &&
        coord.x > 0 && coord.y > 0 && coord.width > 0 && coord.height > 0 &&
        coord.x < width && coord.y < height && coord.width < width && coord.height < height
      );
    });

    const limitedElementCoordinates = safeElementCoordinates.slice(0, 100);
    const annotations = [];

    limitedElementCoordinates.forEach((coord, index) => {
      const x = Math.max(25, Math.min(width - 25, coord.x));
      const y = Math.max(25, Math.min(height - 25, coord.y));

      const color = getImpactColor(coord.impact);

      annotations.push(`
        <rect x="${x - coord.width / 2}" y="${y - coord.height / 2}" width="${coord.width}" height="${coord.height}" 
              fill="none" stroke="${color}" stroke-width="2" opacity="0.3"/>
        <circle cx="${x}" cy="${y}" r="25" fill="${color}" stroke="white" stroke-width="4" opacity="0.9"/>
        <text x="${x}" y="${y + 6}" text-anchor="middle" fill="white" font-size="16" font-weight="bold">${index + 1}</text>
      `);
    });

    // Create legend
    const legendY = height - 300;
    annotations.push(`
      <rect x="20" y="${legendY}" width="600" height="240" fill="rgba(0,0,0,0.8)" rx="20"/>
      <text x="60" y="${legendY + 50}" fill="white" font-size="32" font-weight="bold">Accessibility Issues</text>
      <circle cx="80" cy="${legendY + 90}" r="16" fill="#dc2626"/>
      <text x="120" y="${legendY + 100}" fill="white" font-size="24">Critical</text>
      <circle cx="80" cy="${legendY + 130}" r="16" fill="#ea580c"/>
      <text x="120" y="${legendY + 140}" fill="white" font-size="24">Serious</text>
      <circle cx="280" cy="${legendY + 90}" r="16" fill="#d97706"/>
      <text x="320" y="${legendY + 100}" fill="white" font-size="24">Moderate</text>
      <circle cx="280" cy="${legendY + 130}" r="16" fill="#65a30d"/>
      <text x="320" y="${legendY + 140}" fill="white" font-size="24">Minor</text>
      <text x="60" y="${legendY + 190}" fill="white" font-size="20">Numbers indicate issue locations</text>
    `);

    const svgOverlay = `
      <svg width="${width}" height="${height}">
        ${annotations.join('')}
      </svg>
    `;

    const annotatedImage = await image
      .composite([{
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer();

    console.log('📸 Screenshot annotation completed successfully');
    return annotatedImage;
  } catch (error) {
    console.error('❌ Error annotating screenshot:', error);
    return screenshot;
  }
}

function getImpactColor(impact) {
  switch (impact) {
    case 'critical': return '#dc2626';
    case 'serious': return '#ea580c';
    case 'moderate': return '#d97706';
    case 'minor': return '#65a30d';
    default: return '#6b7280';
  }
}

function calculateAccessibilityScore(axeResults) {
  const violations = axeResults.violations || [];
  const passes = axeResults.passes || [];

  const criticalCount = violations.filter(v => v.impact === 'critical').length;
  const seriousCount = violations.filter(v => v.impact === 'serious').length;
  const moderateCount = violations.filter(v => v.impact === 'moderate').length;
  const minorCount = violations.filter(v => v.impact === 'minor').length;

  const totalViolations = violations.length;
  const passCount = passes.length;

  const weightedViolations = criticalCount * 4 + seriousCount * 3 + moderateCount * 2 + minorCount * 1;
  const totalChecks = totalViolations + passCount;

  let score = 100;
  if (totalChecks > 0) {
    score = Math.max(0, Math.round(100 - (weightedViolations / totalChecks) * 100));
  }

  return {
    totalViolations,
    criticalCount,
    seriousCount,
    moderateCount,
    minorCount,
    passCount,
    score
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'scan-service' });
});

app.listen(PORT, () => {
  console.log(`🚀 Scan Service running on port ${PORT}`);
});
