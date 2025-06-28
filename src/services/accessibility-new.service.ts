import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { StorageService } from './storage.service.js';
import { PageAccessibilityData } from '../types/index.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';

export class AccessibilityService {
  // Accessibility screenshot dimensions (exact specs from requirements)
  static readonly DIMENSIONS = {
    DESKTOP: { width: 1046, height: 679 }, // Updated for annotated desktop screenshot
    MOBILE: { width: 298, height: 742 }   // Mobile accessibility overview (rounded from 297.5)
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
          ? this.DIMENSIONS.MOBILE
          : this.DIMENSIONS.DESKTOP;
          
        await page.setViewport(viewportConfig);
        console.log(`♿ Set ${viewport} viewport: ${viewportConfig.width}x${viewportConfig.height}`);
        
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
          const elementCoordinates = await this.getElementCoordinates(page, violations);
          const screenshot = await page.screenshot({
            fullPage: false,
            type: 'png'
          });
          
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

        // Format violations for storage
        const formattedViolations = violations.map((v: any) => ({
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
    const visualViolations = violations.filter((violation: any) => {
      const skipIds = [
        'document-title', 'html-has-lang', 'meta-viewport', 
        'landmark-one-main', 'region', 'page-has-heading-one'
      ];
      return !skipIds.includes(violation.id);
    });
    
    console.log('📍 Visual violations to process:', visualViolations.length);
    
    const elementCoordinates = await page.evaluate((violations: any[]) => {
      const coords: Array<{x: number, y: number, width: number, height: number, impact: string}> = [];
      
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
                      coords.push({
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
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
          <text x="${x}" y="${y + 4}" text-anchor="middle" fill="white" font-size="12" font-weight="bold" style="font-family: 'Inter', 'Arial', sans-serif;">${index + 1}</text>
        `);
      });
      
      // Add legend at bottom
      const isMobile = width <= 400;
      const legendHeight = isMobile ? 80 : 100;
      const legendY = height - legendHeight - 10;
      const legendFont = "font-family: 'Inter', 'Arial', sans-serif;";
      if (isMobile) {
        // Mobile: stack legend items vertically, smaller font, tighter spacing, wrap keys
        annotations.push(`
          <rect x="10" y="${legendY}" width="${width - 20}" height="${legendHeight}" fill="rgba(0,0,0,0.8)" rx="5"/>
          <text x="20" y="${legendY + 22}" fill="white" font-size="12" font-weight="bold" style="${legendFont}">Accessibility Issues</text>
          <circle cx="30" cy="${legendY + 40}" r="6" fill="#dc2626"/>
          <text x="45" y="${legendY + 44}" fill="white" font-size="10" style="${legendFont}">Critical</text>
          <circle cx="110" cy="${legendY + 40}" r="6" fill="#ea580c"/>
          <text x="125" y="${legendY + 44}" fill="white" font-size="10" style="${legendFont}">Serious</text>
          <circle cx="30" cy="${legendY + 60}" r="6" fill="#d97706"/>
          <text x="45" y="${legendY + 64}" fill="white" font-size="10" style="${legendFont}">Moderate</text>
          <circle cx="110" cy="${legendY + 60}" r="6" fill="#65a30d"/>
          <text x="125" y="${legendY + 64}" fill="white" font-size="10" style="${legendFont}">Minor</text>
          <text x="20" y="${legendY + legendHeight - 10}" fill="white" font-size="9" style="${legendFont}">Numbers indicate issue locations</text>
        `);
      } else {
        // Desktop: original layout, but with font-family
        annotations.push(`
          <rect x="10" y="${legendY}" width="${width - 20}" height="${legendHeight}" fill="rgba(0,0,0,0.8)" rx="5"/>
          <text x="20" y="${legendY + 25}" fill="white" font-size="14" font-weight="bold" style="${legendFont}">Accessibility Issues</text>
          <circle cx="30" cy="${legendY + 45}" r="8" fill="#dc2626"/>
          <text x="50" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Critical</text>
          <circle cx="120" cy="${legendY + 45}" r="8" fill="#ea580c"/>
          <text x="140" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Serious</text>
          <circle cx="210" cy="${legendY + 45}" r="8" fill="#d97706"/>
          <text x="230" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Moderate</text>
          <circle cx="300" cy="${legendY + 45}" r="8" fill="#65a30d"/>
          <text x="320" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Minor</text>
          <text x="20" y="${legendY + 80}" fill="white" font-size="10" style="${legendFont}">Numbers indicate issue locations</text>
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
      case 'critical': return '#dc2626'; // red-600
      case 'serious': return '#ea580c';  // orange-600
      case 'moderate': return '#d97706'; // amber-600
      case 'minor': return '#65a30d';    // lime-600
      default: return '#6b7280';         // gray-500
    }
  }
}
