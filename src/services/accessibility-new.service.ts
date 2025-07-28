import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { StorageService } from './storage.service.js';
import { PageAccessibilityData } from '../types/index.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
import { hideElementsForScreenshot, waitForPageReady, blockAggressiveMapResources } from '../utils/screenshot-helpers.js';

export class AccessibilityService {
  // Filter out non-visual violations that can't be annotated
  private static filterVisualViolations(violations: any[]): any[] {
    const skipIds = [
      'document-title', 'html-has-lang', 'meta-viewport', 
      'landmark-one-main', 'region', 'page-has-heading-one'
    ];
    return violations.filter((violation: any) => !skipIds.includes(violation.id));
  }

  // Accessibility screenshot dimensions (exact specs from requirements)
  static readonly DIMENSIONS = {
    DESKTOP: { width: 1046, height: 679 }, // Updated for annotated desktop screenshot
    MOBILE: { width: 596, height: 1484 }   // Exact mobile image dimensions needed
  };

  static async runAccessibilityAudit(
    url: string,
    auditId: string,
    host: string
  ): Promise<{
    accessibility: PageAccessibilityData;
    annotatedDesktopUrl?: string;
    annotatedMobileUrl?: string;
  }> {
    console.log(`♿ Running accessibility audit for ${url}`);
    
    // Run desktop and mobile accessibility audits SEQUENTIALLY (not parallel)
    console.log(`♿ Running desktop accessibility audit...`);
    const desktopResult = await this.runSingleAccessibilityAudit(url, auditId, host, 'desktop');
    
    console.log(`♿ Running mobile accessibility audit...`);
    const mobileResult = await this.runSingleAccessibilityAudit(url, auditId, host, 'mobile');

    // Combine results - take violations from both desktop and mobile (max 5 each = 10 total)
    const allViolations = [...desktopResult.violations, ...mobileResult.violations];
    
    // Remove duplicates based on violation ID
    const uniqueViolations = allViolations.filter((violation, index, self) => 
      index === self.findIndex(v => v.id === violation.id)
    );

    const summary = {
      score: Math.max(0, 100 - (uniqueViolations.length * 5)), // Simple scoring
      totalViolations: uniqueViolations.length,
      passCount: 0, // We don't track passes for simplicity
      criticalCount: uniqueViolations.filter(v => v.impact === 'critical').length,
      seriousCount: uniqueViolations.filter(v => v.impact === 'serious').length,
      moderateCount: uniqueViolations.filter(v => v.impact === 'moderate').length,
      minorCount: uniqueViolations.filter(v => v.impact === 'minor').length
    };

    const accessibility: PageAccessibilityData = {
      summary,
      violations: uniqueViolations
    };

    const result: {
      accessibility: PageAccessibilityData;
      annotatedDesktopUrl?: string;
      annotatedMobileUrl?: string;
    } = { accessibility };

    if (desktopResult.annotatedScreenshotUrl) {
      result.annotatedDesktopUrl = desktopResult.annotatedScreenshotUrl;
    }
    if (mobileResult.annotatedScreenshotUrl) {
      result.annotatedMobileUrl = mobileResult.annotatedScreenshotUrl;
    }

    return result;
  }

  public static async runSingleAccessibilityAudit(
    url: string,
    auditId: string,
    host: string,
    viewport: 'desktop' | 'mobile'
  ): Promise<{ violations: any[]; annotatedScreenshotUrl?: string }> {
    let lastError: Error | null = null;
    const maxRetries = 2;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let browser = null;
      try {
        console.log(`♿ Accessibility ${viewport} audit attempt ${attempt}/${maxRetries} for ${url}`);
        
        browser = await puppeteer.launch(await PuppeteerConfig.getLaunchOptions());
        
        const page = await browser.newPage();
        
        // Set viewport based on type with accessibility dimensions
        const viewportConfig = viewport === 'mobile' 
          ? { 
              width: this.DIMENSIONS.MOBILE.width,   // 596px - actual image width
              height: this.DIMENSIONS.MOBILE.height, // 1484px - actual image height
              deviceScaleFactor: 1,
              isMobile: true,  // Tell browser this is mobile
              hasTouch: true   // Enable touch events for mobile
            }
          : { ...this.DIMENSIONS.DESKTOP, deviceScaleFactor: 1 };
          
        await page.setViewport(viewportConfig);
        console.log(`♿ Set ${viewport} viewport: ${viewportConfig.width}x${viewportConfig.height} (mobile: ${viewportConfig.isMobile || false})`);
        
        // Strategy 1: Try normal approach first
        let pageLoadedSuccessfully = false;
        try {
          await this.loadPageNormal(page, url, viewport);
          pageLoadedSuccessfully = true;
        } catch (error) {
          console.log(`❌ Normal page load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Strategy 2: If normal failed, try aggressive map blocking
        if (!pageLoadedSuccessfully) {
          try {
            console.log(`🛡️ Attempting aggressive map-blocking approach...`);
            await this.loadPageWithAggressiveBlocking(page, url, viewport);
            pageLoadedSuccessfully = true;
          } catch (error) {
            console.log(`❌ Aggressive approach also failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error; // Re-throw to trigger retry
          }
        }

        // Inject axe-core from local package to bypass CSP restrictions
        try {
          // First try to load locally bundled axe-core
          const axeCoreDir = path.resolve(process.cwd(), 'node_modules', 'axe-core');
          let axeCoreScript: string;
          
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
            
            // Inject the script content directly
            await page.addScriptTag({ content: axeCoreScript });
            console.log('✅ Axe-core injected from local package');
            
          } catch (localError) {
            console.warn('Failed to load axe-core from local package, trying CDN fallback...', localError);
            
            // First CDN fallback
            try {
              await page.addScriptTag({
                url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
              });
              console.log('✅ Axe-core loaded from primary CDN');
            } catch (primaryCdnError) {
              console.warn('Primary CDN failed, trying secondary CDN...', primaryCdnError);
              
              // Second CDN fallback
              try {
                await page.addScriptTag({
                  url: 'https://unpkg.com/axe-core@4.8.2/axe.min.js'
                });
                console.log('✅ Axe-core loaded from secondary CDN');
              } catch (secondaryCdnError) {
                console.warn('Secondary CDN failed, trying CSP bypass...', secondaryCdnError);
                
                // Try to temporarily disable CSP and retry
                await page.setBypassCSP(true);
                await page.addScriptTag({
                  url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
                });
                console.log('✅ Axe-core loaded with CSP bypass');
              }
            }
          }
        } catch (scriptError) {
          console.error('❌ All axe-core loading methods failed:', scriptError);
          const errorMessage = scriptError instanceof Error ? scriptError.message : 'Unknown error loading axe-core';
          throw new Error(`Could not load axe-core script: ${errorMessage}`);
        }

        // Run axe-core accessibility audit with timeout
        let axeResults;
        try {
          axeResults = await Promise.race([
            page.evaluate(() => {
              return new Promise((resolve) => {
                // Add safety check for axe
                if (typeof (window as any).axe === 'undefined') {
                  resolve({ violations: [] });
                  return;
                }
                
                // Run axe with reasonable timeout and standard config - only get violations
                (window as any).axe.run({
                  resultTypes: ['violations'] // Only get violations, skip passes to reduce processing
                }, (err: any, results: any) => {
                  if (err) {
                    console.warn('Axe evaluation error:', err);
                    resolve({ violations: [] });
                  } else {
                    resolve(results);
                  }
                });
              });
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Axe evaluation timeout')), 20000) // 20 second timeout
            )
          ]);
        } catch (axeError) {
          console.warn(`⚠️ Axe evaluation failed for ${viewport}:`, axeError);
          // If axe fails, continue without violations but still take screenshot
          axeResults = { violations: [] };
        }

        const violations = (axeResults as any).violations || [];
        console.log(`♿ Found ${violations.length} ${viewport} violations`);
        
        // Get element coordinates and violation indexes for annotations
        const { elementCoordinates, violationIndexes } = await this.getElementCoordinates(page, violations);
        
        let annotatedScreenshotUrl: string | undefined;

        // Take screenshot with error handling
        try {
          // Skip extensive viewport debugging to reduce CPU
          console.log(`� Taking ${viewport} screenshot with exact dimensions`);
          
          // Get actual viewport dimensions quickly
          const actualViewport = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight
          }));

          // Take screenshot with exact viewport dimensions (no scaling/distortion)
          const screenshot = await page.screenshot({
            fullPage: false,
            type: 'png',
            clip: {
              x: 0,
              y: 0,
              width: actualViewport.width,   // Use actual viewport width
              height: actualViewport.height  // Use actual viewport height
            }
          });
          console.log(`📐 ${viewport} screenshot: ${actualViewport.width}x${actualViewport.height} pixels (1:1 ratio, no distortion)`);
          
          const annotatedScreenshot = await this.annotateScreenshot(
            screenshot as Buffer,
            violations,
            elementCoordinates
          );
          
          const screenshotType = viewport === 'mobile' ? 'annotated-mobile' : 'annotated-desktop';
          annotatedScreenshotUrl = await StorageService.uploadScreenshot(
            annotatedScreenshot,
            auditId,
            screenshotType,
            host
          );
          console.log(`✅ ${viewport} annotated screenshot uploaded: ${annotatedScreenshotUrl}`);
        } catch (screenshotError) {
          console.warn(`⚠️ Screenshot failed for ${viewport}:`, screenshotError);
          // Continue without screenshot
        }

        // Filter out non-visual violations (same as used for annotations)
        const visualViolations = this.filterVisualViolations(violations);

        // Format violations for storage - only the violations that were actually annotated (numbered 1-5)
        // Use violationIndexes to get the exact violations that correspond to the annotations
        const annotatedViolationIndexes = violationIndexes.slice(0, 5); // Only first 5 that were annotated
        const formattedViolations = annotatedViolationIndexes.map((violationIndex: number) => {
          const v = visualViolations[violationIndex];
          return {
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes?.slice(0, 3).map((node: any) => ({
              html: node.html?.substring(0, 200),
              target: node.target,
              failureSummary: node.failureSummary
            })) || []
          };
        });

        // Close browser with timeout to prevent hanging on animated content
        try {
          await Promise.race([
            browser.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), 10000))
          ]);
        } catch (closeError) {
          console.warn(`⚠️ Browser close failed for ${viewport}, force killing:`, closeError);
          try { browser.process()?.kill('SIGKILL'); } catch {}
        }
        
        const result: { violations: any[]; annotatedScreenshotUrl?: string } = {
          violations: formattedViolations
        };
        
        if (annotatedScreenshotUrl) {
          result.annotatedScreenshotUrl = annotatedScreenshotUrl;
        }
        
        return result;
        
      } catch (error) {
        console.error(`❌ Accessibility ${viewport} audit attempt ${attempt} failed:`, error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Clean up browser if it exists
        if (browser) {
          try {
            await Promise.race([
              browser.close(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), 5000))
            ]);
          } catch (closeError) {
            try { browser.process()?.kill('SIGKILL'); } catch {}
          }
        }
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Wait before retry, longer wait for session closed errors
        const waitTime = error instanceof Error && error.message.includes('Session closed') ? 5000 : 2000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw lastError || new Error('All accessibility audit attempts failed');
  }

  private static async getElementCoordinates(
    page: any,
    violations: any[]
  ): Promise<{
    elementCoordinates: Array<{x: number, y: number, width: number, height: number, impact: string}>;
    violationIndexes: number[];
  }> {
    console.log('📍 Getting element coordinates for', violations.length, 'violations');
    
    // Scroll to top to ensure consistent coordinate system
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    
    // Wait for page to be stable using shared utility
    await waitForPageReady(page, 500);

    // Wait additional 3 seconds for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Filter out non-visual violations
    const visualViolations = this.filterVisualViolations(violations);
    
    console.log('📍 Visual violations to process:', visualViolations.length);
    
    const result = await page.evaluate((violations: any[]) => {
      const coords: Array<{x: number, y: number, width: number, height: number, impact: string}> = [];
      const violationIndexes: number[] = [];
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let elementsOutsideViewport = 0;
      
      violations.forEach((violation: any, violationIndex: number) => {
        violation.nodes.forEach((node: any) => {
          try {
            const selectors = Array.isArray(node.target) ? node.target : [node.target];
            selectors.forEach((selector: string) => {
              if (typeof selector === 'string') {
                try {
                  const elements = document.querySelectorAll(selector);
                  elements.forEach((element: Element) => {
                    const rect = element.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      const centerX = rect.left + rect.width / 2;
                      const centerY = rect.top + rect.height / 2;
                      
                      // Check if element is outside viewport
                      if (centerX < 0 || centerX > viewportWidth || centerY < 0 || centerY > viewportHeight) {
                        elementsOutsideViewport++;
                      }
                      
                      coords.push({
                        x: centerX,
                        y: centerY,
                        width: rect.width,
                        height: rect.height,
                        impact: violation.impact
                      });
                      violationIndexes.push(violationIndex);
                    }
                  });
                } catch (selectorError) {
                  console.warn('Invalid selector:', selector);
                }
              }
            });
          } catch (error) {
            console.warn('Error getting coordinates for node');
          }
        });
      });
      
      console.log(`📍 Viewport: ${viewportWidth}x${viewportHeight}, Elements outside viewport: ${elementsOutsideViewport}/${coords.length}`);
      return { elementCoordinates: coords, violationIndexes };
    }, visualViolations);
    
    console.log('📍 Got coordinates for', result.elementCoordinates.length, 'elements');
    return result;
  }

  private static async annotateScreenshot(
    screenshot: Buffer,
    violations: any[],
    elementCoordinates: Array<{x: number, y: number, width: number, height: number, impact: string}>
  ): Promise<Buffer> {
    try {
      console.log('📸 Annotating screenshot with', elementCoordinates.length, 'coordinates');
      
      if (elementCoordinates.length === 0) {
        console.log('📸 No coordinates to annotate');
        return screenshot;
      }
      
      const image = sharp(screenshot);
      const { width, height } = await image.metadata();
      
      if (!width || !height) {
        throw new Error('Could not get image dimensions');
      }
      
      // Create SVG overlay for annotations
      const annotations: string[] = [];
      
      elementCoordinates.forEach((coord, index) => {
        // Only annotate the first 5 violations
        if (index >= 5) return;
        
        const x = Math.max(30, Math.min(width - 30, coord.x)); // Adjusted margins for larger circles
        const y = Math.max(30, Math.min(height - 30, coord.y));
        const color = this.getImpactColor(coord.impact);
        
        // Add circle with number (100% larger size, 75% background transparency)
        annotations.push(`
          <circle cx="${x}" cy="${y}" r="30" fill="${color}" stroke="white" stroke-width="4" opacity="0.75"/>
          <text x="${x}" y="${y + 8}" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold">${index + 1}</text>
        `);
      });
      
      // Remove legend - no longer needed
      
      const svgOverlay = `
        <svg width="${width}" height="${height}">
          ${annotations.join('')}
        </svg>
      `;
      
      // Composite the annotation overlay onto the screenshot
      const annotatedImage = await image
        .composite([{
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0,
        }])
        .png()
        .toBuffer();
      
      console.log('📸 Screenshot annotation completed');
      return annotatedImage;
      
    } catch (error) {
      console.error('❌ Error annotating screenshot:', error);
      return screenshot;
    }
  }

  private static getImpactColor(impact: string): string {
    switch (impact) {
      case 'critical': return '#dc2626';    // red
      case 'serious': return '#ea580c';     // orange
      case 'moderate': return '#d97706';    // yellow/amber
      case 'minor': return '#0d9488';       // teal
      default: return '#6b7280';            // gray
    }
  }

  private static async loadPageNormal(page: any, url: string, viewport: string): Promise<void> {
    console.log(`🌐 Normal navigation to: ${url} (${viewport})`);
    
    // For mobile, ensure proper responsive handling
    if (viewport === 'mobile') {
      // Set user agent to mobile to trigger responsive design
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
      
      // Add viewport meta tag and force mobile CSS to apply at 596px width
      await page.evaluateOnNewDocument(() => {
        // Add viewport meta tag if not present
        if (!document.querySelector('meta[name="viewport"]')) {
          const meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=device-width, initial-scale=1.0';
          document.head.appendChild(meta);
        }
      });
    }
    
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Hide elements using shared utility
    await waitForPageReady(page);
    await hideElementsForScreenshot(page);
    
    console.log(`✅ Normal page load completed for ${viewport}`);
  }

  private static async loadPageWithAggressiveBlocking(page: any, url: string, viewport: string): Promise<void> {
    console.log(`🛡️ Aggressive navigation to: ${url} (${viewport}) with map blocking`);
    
    // For mobile, ensure proper responsive handling
    if (viewport === 'mobile') {
      // Set user agent to mobile to trigger responsive design
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
      
      // Add viewport meta tag and force mobile CSS to apply at 596px width
      await page.evaluateOnNewDocument(() => {
        // Add viewport meta tag if not present
        if (!document.querySelector('meta[name="viewport"]')) {
          const meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=device-width, initial-scale=1.0';
          document.head.appendChild(meta);
        }
      });
    }
    
    // Block all map resources before navigation
    await blockAggressiveMapResources(page);
    
    await page.goto(url, {
      waitUntil: 'domcontentloaded', 
      timeout: 25000 // Shorter timeout for aggressive mode
    });
    
    // Hide elements and map containers
    const mapSelectors = [
      '[id*="map"]',
      '[class*="map"]', 
      '.leaflet-container',
      '.mapboxgl-map',
      '.google-map',
      'iframe[src*="maps"]',
      '.osm-map',
      '#map',
      '.map'
    ];
    
    await hideElementsForScreenshot(page, mapSelectors);
    
    // Shorter wait for aggressive mode
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`✅ Aggressive page load completed for ${viewport}`);
  }
}
