import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { StorageService } from './storage.service.js';
import { PageAccessibilityData } from '../types/index.js';

export class AccessibilityService {
  // Accessibility screenshot dimensions (exact specs from requirements)
  static readonly DIMENSIONS = {
    DESKTOP: { width: 545, height: 500 }, // Desktop accessibility overview
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

  private static async runSingleAccessibilityAudit(
    url: string,
    auditId: string,
    host: string,
    viewport: 'desktop' | 'mobile'
  ): Promise<{ violations: any[]; annotatedScreenshotUrl?: string }> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage();
      
      // Set viewport based on type with accessibility dimensions
      const viewportConfig = viewport === 'mobile' 
        ? this.DIMENSIONS.MOBILE
        : this.DIMENSIONS.DESKTOP;
        
      await page.setViewport(viewportConfig);
      console.log(`♿ Set ${viewport} viewport: ${viewportConfig.width}x${viewportConfig.height}`);
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Inject axe-core
      await page.addScriptTag({
        url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
      });

      // Run axe-core accessibility audit
      const axeResults = await page.evaluate(() => {
        return new Promise((resolve) => {
          (window as any).axe.run((err: any, results: any) => {
            if (err) {
              resolve({ violations: [], passes: [] });
            } else {
              resolve(results);
            }
          });
        });
      });

      const violations = (axeResults as any).violations || [];
      console.log(`♿ Found ${violations.length} ${viewport} violations`);
      
      let annotatedScreenshotUrl: string | undefined;

      // Only create annotated screenshots if there are violations
      if (violations.length > 0) {
        console.log(`🔍 Found ${violations.length} accessibility violations for ${viewport}`);
        
        // Get element coordinates for annotation
        const elementCoordinates = await this.getElementCoordinates(page, violations);
        
        // Take screenshot
        const screenshot = await page.screenshot({
          fullPage: false,
          type: 'png'
        });

        // Annotate screenshot with violations
        const annotatedScreenshot = await this.annotateScreenshot(
          screenshot as Buffer, 
          violations, 
          elementCoordinates
        );

        // Upload annotated screenshot
        const screenshotType = viewport === 'mobile' ? 'annotated-mobile' : 'annotated-desktop';
        annotatedScreenshotUrl = await StorageService.uploadScreenshot(
          annotatedScreenshot,
          auditId,
          screenshotType,
          host
        );
        console.log(`✅ ${viewport} annotated screenshot uploaded: ${annotatedScreenshotUrl}`);
      }

      // Format violations for storage
      const formattedViolations = violations.map((v: any) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map((node: any) => ({
          html: node.html,
          target: node.target
        }))
      }));

      const result: { violations: any[]; annotatedScreenshotUrl?: string } = {
        violations: formattedViolations
      };

      if (annotatedScreenshotUrl) {
        result.annotatedScreenshotUrl = annotatedScreenshotUrl;
      }

      return result;

    } finally {
      await browser.close();
    }
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
    
    await page.waitForTimeout(500);
    
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
          <text x="${x}" y="${y + 4}" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${index + 1}</text>
        `);
      });
      
      // Add legend at bottom
      const legendY = height - 120;
      annotations.push(`
        <rect x="10" y="${legendY}" width="${width - 20}" height="100" fill="rgba(0,0,0,0.8)" rx="5"/>
        <text x="20" y="${legendY + 25}" fill="white" font-size="14" font-weight="bold">Accessibility Issues</text>
        <circle cx="30" cy="${legendY + 45}" r="8" fill="#dc2626"/>
        <text x="50" y="${legendY + 50}" fill="white" font-size="12">Critical</text>
        <circle cx="120" cy="${legendY + 45}" r="8" fill="#ea580c"/>
        <text x="140" y="${legendY + 50}" fill="white" font-size="12">Serious</text>
        <circle cx="210" cy="${legendY + 45}" r="8" fill="#d97706"/>
        <text x="230" y="${legendY + 50}" fill="white" font-size="12">Moderate</text>
        <circle cx="300" cy="${legendY + 45}" r="8" fill="#65a30d"/>
        <text x="320" y="${legendY + 50}" fill="white" font-size="12">Minor</text>
        <text x="20" y="${legendY + 80}" fill="white" font-size="10">Numbers indicate issue locations</text>
      `);
      
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
