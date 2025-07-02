import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { StorageService } from './storage.service.js';
import { PageAccessibilityData } from '../types/index.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';

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

    // Combine results - take the worst case for violations
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
        
        // Verify viewport was actually set correctly
        const actualViewportAfterSet = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }));
        console.log(`♿ Actual viewport after setting: ${actualViewportAfterSet.width}x${actualViewportAfterSet.height}`);
        
        if (actualViewportAfterSet.width !== viewportConfig.width || actualViewportAfterSet.height !== viewportConfig.height) {
          console.warn(`⚠️ Viewport mismatch! Expected: ${viewportConfig.width}x${viewportConfig.height}, Got: ${actualViewportAfterSet.width}x${actualViewportAfterSet.height}`);
        }
        
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
            
            // Override CSS media queries to treat 596px as mobile
            const style = document.createElement('style');
            style.textContent = `
              /* Force mobile styles to apply at 596px width */
              @media (max-width: 768px) {
                /* This will now apply to our 596px viewport */
              }
            `;
            document.head.appendChild(style);
          });
        }
        
        // Navigate with longer timeout and better error handling
        await page.goto(url, { 
          waitUntil: 'networkidle2', 
          timeout: 60000 // Increased timeout for production
        });

        // Hide elements before screenshot
        await page.evaluate(() => {
          const el = document.querySelector('#CybotCookiebotDialog');
          if (el) {
            (el as HTMLElement).style.display = 'none';
          }
        });

        // Inject axe-core with error handling
        try {
          await page.addScriptTag({
            url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
          });
        } catch (scriptError) {
          console.warn('Failed to load axe-core from CDN, trying fallback...');
          await page.addScriptTag({
            url: 'https://unpkg.com/axe-core@4.8.2/axe.min.js'
          });
        }

        // Run axe-core accessibility audit with timeout
        const axeResults = await Promise.race([
          page.evaluate(() => {
            return new Promise((resolve) => {
              (window as any).axe.run((err: any, results: any) => {
                if (err) {
                  resolve({ violations: [], passes: [] });
                } else {
                  resolve(results);
                }
              });
            });
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Axe evaluation timeout')), 30000)
          )
        ]);

        const violations = (axeResults as any).violations || [];
        console.log(`♿ Found ${violations.length} ${viewport} violations`);
        
        let annotatedScreenshotUrl: string | undefined;

        // Take screenshot with error handling
        try {
          // Debug viewport and content dimensions
          const viewportInfo = await page.evaluate(() => {
            return {
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight
              },
              document: {
                scrollWidth: document.documentElement.scrollWidth,
                scrollHeight: document.documentElement.scrollHeight,
                clientWidth: document.documentElement.clientWidth,
                clientHeight: document.documentElement.clientHeight
              },
              body: {
                scrollWidth: document.body.scrollWidth,
                scrollHeight: document.body.scrollHeight,
                clientWidth: document.body.clientWidth,
                clientHeight: document.body.clientHeight
              }
            };
          });
          console.log(`📏 ${viewport} viewport info:`, JSON.stringify(viewportInfo, null, 2));
          
          const elementCoordinates = await this.getElementCoordinates(page, violations);
          
          // Get actual viewport dimensions to ensure screenshot matches exactly
          const actualViewport = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight
          }));
          
          console.log(`📸 Taking ${viewport} screenshot with exact dimensions`);
          
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

        // Format violations for storage - only visual violations to match annotations
        const formattedViolations = visualViolations.map((v: any) => ({
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

        await browser.close();
        
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
            await browser.close();
          } catch (closeError) {
            console.warn('Failed to close browser:', closeError);
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
  ): Promise<Array<{x: number, y: number, width: number, height: number, impact: string}>> {
    console.log('📍 Getting element coordinates for', violations.length, 'violations');
    
    // Scroll to top to ensure consistent coordinate system
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    
    // Wait for 500ms to ensure page is stable
    await new Promise(res => setTimeout(res, 500));
    
    // Filter out non-visual violations
    const visualViolations = this.filterVisualViolations(violations);
    
    console.log('📍 Visual violations to process:', visualViolations.length);
    
    const elementCoordinates = await page.evaluate((violations: any[]) => {
      const coords: Array<{x: number, y: number, width: number, height: number, impact: string}> = [];
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let elementsOutsideViewport = 0;
      
      violations.forEach((violation: any) => {
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
      return coords;
    }, visualViolations);
    
    console.log('📍 Got coordinates for', elementCoordinates.length, 'elements');
    return elementCoordinates;
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
        const x = Math.max(25, Math.min(width - 25, coord.x));
        const y = Math.max(25, Math.min(height - 25, coord.y));
        const color = this.getImpactColor(coord.impact);
        
        // Add circle with number
        annotations.push(`
          <circle cx="${x}" cy="${y}" r="15" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>
          <text x="${x}" y="${y + 4}" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${index + 1}</text>
        `);
      });
      
      // Add legend with colors
      const isMobile = width <= 400;
      const legendHeight = isMobile ? 80 : 60;
      const legendY = height - legendHeight - 10;
      
      if (isMobile) {
        annotations.push(`
          <rect x="10" y="${legendY}" width="${width - 20}" height="${legendHeight}" fill="rgba(0,0,0,0.8)" rx="5"/>
          <text x="20" y="${legendY + 18}" fill="white" font-size="12" font-weight="bold">Accessibility Issues</text>
          <circle cx="25" cy="${legendY + 35}" r="6" fill="#dc2626"/>
          <text x="38" y="${legendY + 39}" fill="white" font-size="9">Critical</text>
          <circle cx="90" cy="${legendY + 35}" r="6" fill="#ea580c"/>
          <text x="103" y="${legendY + 39}" fill="white" font-size="9">Serious</text>
          <circle cx="25" cy="${legendY + 55}" r="6" fill="#d97706"/>
          <text x="38" y="${legendY + 59}" fill="white" font-size="9">Moderate</text>
          <circle cx="90" cy="${legendY + 55}" r="6" fill="#0d9488"/>
          <text x="103" y="${legendY + 59}" fill="white" font-size="9">Minor</text>
        `);
      } else {
        annotations.push(`
          <rect x="10" y="${legendY}" width="${width - 20}" height="${legendHeight}" fill="rgba(0,0,0,0.8)" rx="5"/>
          <text x="20" y="${legendY + 20}" fill="white" font-size="14" font-weight="bold">Accessibility Issues</text>
          <circle cx="30" cy="${legendY + 40}" r="8" fill="#dc2626"/>
          <text x="50" y="${legendY + 45}" fill="white" font-size="12">Critical</text>
          <circle cx="120" cy="${legendY + 40}" r="8" fill="#ea580c"/>
          <text x="140" y="${legendY + 45}" fill="white" font-size="12">Serious</text>
          <circle cx="210" cy="${legendY + 40}" r="8" fill="#d97706"/>
          <text x="230" y="${legendY + 45}" fill="white" font-size="12">Moderate</text>
          <circle cx="300" cy="${legendY + 40}" r="8" fill="#0d9488"/>
          <text x="320" y="${legendY + 45}" fill="white" font-size="12">Minor</text>
        `);
      }
      
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
}
