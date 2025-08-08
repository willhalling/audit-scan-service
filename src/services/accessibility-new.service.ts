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

  private static async injectAxeCore(page: any): Promise<void> {
    console.log('📦 Attempting to inject axe-core...');
    
    // First try to load locally bundled axe-core
    try {
      const axeCoreDir = path.resolve(process.cwd(), 'node_modules', 'axe-core');
      let axeCoreScript: string;
      
      try {
        // Try to load from the main dist file
        const axeCoreMainPath = path.join(axeCoreDir, 'axe.min.js');
        if (fs.existsSync(axeCoreMainPath)) {
          console.log('📦 Loading axe-core from main path...');
          axeCoreScript = fs.readFileSync(axeCoreMainPath, 'utf8');
        } else {
          // Fallback to alternative path
          console.log('📦 Loading axe-core from dist path...');
          const axeCoreAltPath = path.join(axeCoreDir, 'dist', 'axe.min.js');
          axeCoreScript = fs.readFileSync(axeCoreAltPath, 'utf8');
        }
        
        // Inject the script content directly with timeout
        console.log('📦 Injecting axe-core script content...');
        await Promise.race([
          page.addScriptTag({ content: axeCoreScript }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Script injection timeout')), 10000))
        ]);
        
        console.log('✅ Axe-core injected from local package');
        return;
        
      } catch (localError) {
        console.warn('📦 Failed to load axe-core from local package:', localError);
        throw localError; // Let it fall through to CDN fallback
      }
      
    } catch (localError) {
      console.warn('📦 Local axe-core injection failed, trying CDN fallback...');
      
      // First CDN fallback with timeout
      try {
        console.log('📦 Trying primary CDN...');
        await Promise.race([
          page.addScriptTag({
            url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Primary CDN timeout')), 8000))
        ]);
        console.log('✅ Axe-core loaded from primary CDN');
        return;
        
      } catch (primaryCdnError) {
        console.warn('📦 Primary CDN failed:', primaryCdnError);
        
        // Second CDN fallback with timeout
        try {
          console.log('📦 Trying secondary CDN...');
          await Promise.race([
            page.addScriptTag({
              url: 'https://unpkg.com/axe-core@4.8.2/axe.min.js'
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Secondary CDN timeout')), 8000))
          ]);
          console.log('✅ Axe-core loaded from secondary CDN');
          return;
          
        } catch (secondaryCdnError) {
          console.warn('📦 Secondary CDN failed:', secondaryCdnError);
          
          // Try to temporarily disable CSP and retry with timeout
          try {
            console.log('📦 Trying CSP bypass...');
            await page.setBypassCSP(true);
            await Promise.race([
              page.addScriptTag({
                url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('CSP bypass timeout')), 8000))
            ]);
            console.log('✅ Axe-core loaded with CSP bypass');
            return;
            
          } catch (cspError) {
            console.error('📦 CSP bypass also failed:', cspError);
            throw new Error('All axe-core loading methods failed');
          }
        }
      }
    }
  }

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
    console.log(`✅ Desktop accessibility audit completed`);
    
    console.log(`♿ Running mobile accessibility audit...`);
    const mobileResult = await this.runSingleAccessibilityAudit(url, auditId, host, 'mobile');
    console.log(`✅ Mobile accessibility audit completed`);

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
        let axeInjectionSuccess = false;
        try {
          console.log('🔧 Starting axe-core injection...');
          
          // Add timeout wrapper for the entire axe injection process
          const axeInjectionPromise = this.injectAxeCore(page);
          const axeTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Axe injection timeout after 15 seconds')), 15000)
          );
          
          await Promise.race([axeInjectionPromise, axeTimeoutPromise]);
          axeInjectionSuccess = true;
          console.log('✅ Axe-core injection completed successfully');
          
        } catch (axeError) {
          console.error('❌ Axe-core injection failed:', axeError);
          // Continue without axe-core - we'll return empty violations
        }

        // Run axe-core accessibility audit with timeout only if injection succeeded
        let axeResults: { violations: any[] } = { violations: [] };
        if (axeInjectionSuccess) {
          try {
            console.log('🔍 Starting axe-core evaluation...');
            
            axeResults = await Promise.race([
              page.evaluate(() => {
                return new Promise((resolve) => {
                  // Add safety check for axe
                  if (typeof (window as any).axe === 'undefined') {
                    console.warn('Axe not available in page context');
                    resolve({ violations: [] });
                    return;
                  }
                  
                  console.log('Running axe.run...');
                  // Run axe with reasonable timeout and standard config - only get violations
                  (window as any).axe.run({
                    resultTypes: ['violations'] // Only get violations, skip passes to reduce processing
                  }, (err: any, results: any) => {
                    if (err) {
                      console.warn('Axe evaluation error:', err);
                      resolve({ violations: [] });
                    } else {
                      console.log('Axe evaluation completed with', results.violations?.length || 0, 'violations');
                      resolve(results);
                    }
                  });
                });
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Axe evaluation timeout after 25 seconds')), 25000)
              )
            ]) as { violations: any[] };
            
            console.log('✅ Axe evaluation completed successfully');
            
          } catch (axeError) {
            console.warn(`⚠️ Axe evaluation failed for ${viewport}:`, axeError);
            // If axe fails, continue without violations but still take screenshot
            axeResults = { violations: [] };
          }
        } else {
          console.log('⚠️ Skipping axe evaluation due to injection failure');
        }

        const violations = (axeResults as any).violations || [];
        console.log(`♿ Found ${violations.length} ${viewport} violations`);
        
        // Get element coordinates and violation indexes for annotations with fallback
        let elementCoordinates: Array<{x: number, y: number, width: number, height: number, impact: string}> = [];
        let violationIndexes: number[] = [];
        
        try {
          console.log('📍 Attempting coordinate extraction...');
          const coordinateResult = await this.getElementCoordinates(page, violations);
          elementCoordinates = coordinateResult.elementCoordinates;
          violationIndexes = coordinateResult.violationIndexes;
          console.log('✅ Coordinate extraction completed successfully');
        } catch (coordinateError) {
          console.warn(`⚠️ Coordinate extraction failed for ${viewport}, continuing without annotations:`, coordinateError);
          // Continue without coordinates - the screenshot will be taken but not annotated
          elementCoordinates = [];
          violationIndexes = [];
        }
        
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

        // Format violations for storage - handle case where coordinate extraction failed
        let formattedViolations: any[] = [];
        if (violationIndexes.length > 0) {
          // Use violationIndexes to get the exact violations that correspond to the annotations
          const annotatedViolationIndexes = violationIndexes.slice(0, 5); // Only first 5 that were annotated
          formattedViolations = annotatedViolationIndexes.map((violationIndex: number) => {
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
        } else {
          // Fallback: use first 5 visual violations if coordinate extraction failed
          formattedViolations = visualViolations.slice(0, 5).map((v: any) => ({
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
          }));
        }

        // Close browser with timeout to prevent hanging on animated content
        console.log(`🔒 Closing ${viewport} browser...`);
        try {
          await Promise.race([
            browser.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timeout')), 5000)) // Reduced to 5 seconds
          ]);
          console.log(`✅ ${viewport} browser closed successfully`);
        } catch (closeError) {
          console.warn(`⚠️ Browser close failed for ${viewport}, force killing:`, closeError);
          try { 
            if (browser.process()) {
              browser.process()?.kill('SIGKILL'); 
              console.log(`💀 ${viewport} browser process killed`);
            }
          } catch (killError) {
            console.warn(`⚠️ Failed to kill ${viewport} browser process:`, killError);
          }
        }
        
        console.log(`📋 Preparing ${viewport} result with ${formattedViolations.length} violations`);
        const result: { violations: any[]; annotatedScreenshotUrl?: string } = {
          violations: formattedViolations
        };
        
        if (annotatedScreenshotUrl) {
          result.annotatedScreenshotUrl = annotatedScreenshotUrl;
        }
        
        console.log(`✅ ${viewport} audit completed, returning result`);
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
    
    // Early exit if no violations
    if (violations.length === 0) {
      console.log('📍 No violations to process, returning empty coordinates');
      return {
        elementCoordinates: [],
        violationIndexes: []
      };
    }
    
    try {
      // Scroll to top to ensure consistent coordinate system with timeout
      console.log('📍 Scrolling to top...');
      await Promise.race([
        page.evaluate(() => {
          window.scrollTo(0, 0);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Scroll timeout')), 3000))
      ]);
      
      // Wait for page to be stable using shared utility with timeout
      console.log('📍 Waiting for page ready...');
      const waitPromise = waitForPageReady(page, 500);
      const waitTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Page ready timeout')), 5000)
      );
      
      try {
        await Promise.race([waitPromise, waitTimeoutPromise]);
      } catch (error) {
        console.log('⚠️ Page ready wait timed out, continuing...');
      }

      // Reduced wait time for page to fully load
      console.log('📍 Final page load wait...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Filter out non-visual violations
      const visualViolations = this.filterVisualViolations(violations);
      
      console.log('📍 Visual violations to process:', visualViolations.length);
      
      // Coordinate extraction with aggressive timeout and limits
      console.log('📍 Extracting coordinates...');
      const result = await Promise.race([
        page.evaluate((violations: any[]) => {
          console.log('📍 Starting coordinate extraction in browser...');
          const coords: Array<{x: number, y: number, width: number, height: number, impact: string}> = [];
          const violationIndexes: number[] = [];
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          let processedElements = 0;
          const maxProcessingTime = Date.now() + 6000; // 6 second internal timeout
          
          // Process only first 5 violations to prevent hanging
          const limitedViolations = violations.slice(0, 5);
          
          for (let violationIndex = 0; violationIndex < limitedViolations.length; violationIndex++) {
            // Check internal timeout frequently
            if (Date.now() > maxProcessingTime) {
              console.log('📍 Internal timeout reached, stopping coordinate extraction');
              break;
            }
            
            const violation = limitedViolations[violationIndex];
            
            // Stop after 5 coordinates to prevent hanging
            if (coords.length >= 5) break;

            // Process only first 2 nodes to reduce complexity
            const limitedNodes = violation.nodes?.slice(0, 2) || [];
            
            for (const node of limitedNodes) {
              // Check timeout again
              if (Date.now() > maxProcessingTime || coords.length >= 5) break;
              
              try {
                const selectors = Array.isArray(node.target) ? node.target : [node.target];
                
                // Process only the first selector to reduce complexity
                const firstSelector = selectors[0];
                if (typeof firstSelector === 'string') {
                  try {
                    const elements = document.querySelectorAll(firstSelector);
                    // Process only the first 2 elements found
                    const limitedElements = Array.from(elements).slice(0, 2);
                    
                    for (const element of limitedElements) {
                      if (Date.now() > maxProcessingTime || coords.length >= 5) break;
                      
                      processedElements++;
                      const rect = element.getBoundingClientRect();
                      if (rect.width > 0 && rect.height > 0) {
                        const centerX = rect.left + rect.width / 2;
                        const centerY = rect.top + rect.height / 2;
                        
                        coords.push({
                          x: centerX,
                          y: centerY,
                          width: rect.width,
                          height: rect.height,
                          impact: violation.impact
                        });
                        violationIndexes.push(violationIndex);
                      }
                    }
                  } catch (selectorError) {
                    console.warn('Invalid selector:', firstSelector);
                  }
                }
              } catch (error) {
                console.warn('Error getting coordinates for node');
              }
            }
          }
          
          console.log(`📍 Coordinate extraction complete. Viewport: ${viewportWidth}x${viewportHeight}, Coords found: ${coords.length}, Processed: ${processedElements}`);
          return { elementCoordinates: coords, violationIndexes };
        }, visualViolations),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Coordinate extraction timeout after 8 seconds')), 8000)
        )
      ]);
      
      console.log('📍 Got coordinates for', result.elementCoordinates.length, 'elements');
      return result;
      
    } catch (error) {
      console.error('❌ Error getting element coordinates:', error);
      // Return empty coordinates on failure rather than crashing
      return {
        elementCoordinates: [],
        violationIndexes: []
      };
    }
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
