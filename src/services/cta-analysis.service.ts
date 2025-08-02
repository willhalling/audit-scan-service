import puppeteer, { Browser, Page } from 'puppeteer-core';
import { CTAAnalysisResult, CTAStyleData } from '../types/index.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';

export class CTAAnalysisService {
  private static readonly DEFAULT_MAX_CTAS = 3;
  private static readonly CTA_SELECTORS = [
    'button',
    'a[href]',
    'input[type="submit"]',
    'input[type="button"]',
    '[role="button"]',
    '.btn',
    '.button',
    '.cta'
  ];

  /**
   * Analyzes CTA visual properties for conversion optimization
   * @param url - The URL to analyze
   * @param options - Configuration options
   */
  static async analyzeCTAs(
    url: string, 
    options: {
      enabled?: boolean;
      maxCTAs?: number;
      browser?: Browser;
      useExistingBrowser?: boolean;
    } = {}
  ): Promise<CTAAnalysisResult | null> {
    
    const { 
      enabled = true, 
      maxCTAs = this.DEFAULT_MAX_CTAS,
      browser: existingBrowser,
      useExistingBrowser = false
    } = options;

    if (!enabled) {
      console.log('🚫 CTA Analysis disabled - skipping visual analysis');
      return null;
    }

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      console.log(`🎯 Starting CTA visual analysis for ${url} (max ${maxCTAs} CTAs)`);

      // Use existing browser or create new one
      if (useExistingBrowser && existingBrowser) {
        browser = existingBrowser;
      } else {
        browser = await puppeteer.launch(await PuppeteerConfig.getLaunchOptions());
      }

      page = await browser.newPage();
      
      // Set viewport for consistent analysis
      await page.setViewport({ width: 1366, height: 768 });
      
      // Navigate to page
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      // Extract CTA data with visual properties
      const ctaData = await this.extractCTAData(page, maxCTAs);
      
      // Analyze the extracted data
      const analysisResult = this.analyzeCTAData(ctaData);

      console.log(`✅ CTA visual analysis completed: ${analysisResult.analyzedCTAs.length} CTAs analyzed`);
      
      return analysisResult;

    } catch (error) {
      console.error(`❌ CTA visual analysis failed for ${url}:`, error);
      return null;
    } finally {
      if (page) {
        await page.close();
      }
      
      // Only close browser if we created it
      if (browser && !useExistingBrowser) {
        await browser.close();
      }
    }
  }

  /**
   * Extract CTA visual data from the page
   */
  private static async extractCTAData(page: Page, maxCTAs: number): Promise<CTAStyleData[]> {
    return await page.evaluate((selectors: string[], maxCTAs: number) => {
      
      // Helper function to calculate contrast ratio
      function getContrastRatio(foreground: string, background: string): number {
        const getLuminance = (color: string): number => {
          const rgb = color.match(/\d+/g);
          if (!rgb || rgb.length < 3) return 0;
          
          const [r, g, b] = rgb.map(c => {
            const val = parseInt(c) / 255;
            return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
          });
          
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };

        const fgLum = getLuminance(foreground);
        const bgLum = getLuminance(background);
        const lighter = Math.max(fgLum, bgLum);
        const darker = Math.min(fgLum, bgLum);
        
        return (lighter + 0.05) / (darker + 0.05);
      }

      // Get accessibility score based on contrast ratio
      function getAccessibilityScore(contrastRatio: number): 'AA' | 'AAA' | 'Fail' {
        if (contrastRatio >= 7) return 'AAA';
        if (contrastRatio >= 4.5) return 'AA';
        return 'Fail';
      }

      // Find all potential CTAs
      const allCTAs: Element[] = [];
      selectors.forEach(selector => {
        const elements = Array.from(document.querySelectorAll(selector));
        allCTAs.push(...elements);
      });

      // Remove duplicates and filter meaningful CTAs
      const uniqueCTAs = Array.from(new Set(allCTAs)).filter(el => {
        const text = el.textContent?.trim() || '';
        const styles = window.getComputedStyle(el);
        
        // Filter out hidden, very small, or empty CTAs
        return text.length > 0 && 
               styles.display !== 'none' && 
               styles.visibility !== 'hidden' &&
               parseFloat(styles.width) > 10 &&
               parseFloat(styles.height) > 10;
      });

      // Sort by likelihood of being a CTA (size, position, styling)
      const sortedCTAs = uniqueCTAs.sort((a, b) => {
        const aStyles = window.getComputedStyle(a);
        const bStyles = window.getComputedStyle(b);
        const aSize = parseFloat(aStyles.width) * parseFloat(aStyles.height);
        const bSize = parseFloat(bStyles.width) * parseFloat(bStyles.height);
        
        // Prioritize buttons and obvious CTAs
        const aScore = (a.tagName === 'BUTTON' ? 100 : 0) + 
                      (a.classList.contains('btn') || a.classList.contains('button') ? 50 : 0) +
                      (aSize / 1000);
        const bScore = (b.tagName === 'BUTTON' ? 100 : 0) + 
                      (b.classList.contains('btn') || b.classList.contains('button') ? 50 : 0) +
                      (bSize / 1000);
        
        return bScore - aScore;
      });

      // Limit to maxCTAs for performance
      const ctasToAnalyze = sortedCTAs.slice(0, maxCTAs);

      // Extract detailed data for each CTA
      return ctasToAnalyze.map((el, index) => {
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        
        // Create a selector for this element
        const selector = el.tagName.toLowerCase() + 
                        (el.id ? `#${el.id}` : '') +
                        (el.className ? `.${Array.from(el.classList).join('.')}` : '') +
                        `:nth-of-type(${index + 1})`;

        // Calculate contrast ratio
        const backgroundColor = styles.backgroundColor || 'rgb(255, 255, 255)';
        const color = styles.color || 'rgb(0, 0, 0)';
        const contrastRatio = getContrastRatio(color, backgroundColor);

        return {
          text,
          selector: selector.substring(0, 100), // Limit selector length
          styles: {
            backgroundColor,
            color,
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            padding: styles.padding,
            margin: styles.margin,
            borderRadius: styles.borderRadius,
            border: styles.border,
            width: styles.width,
            height: styles.height,
            position: styles.position,
            zIndex: styles.zIndex
          },
          dimensions: {
            width: rect.width,
            height: rect.height
          },
          position: {
            x: rect.left,
            y: rect.top
          },
          isVisible: rect.width > 0 && rect.height > 0 && styles.opacity !== '0',
          contrastRatio: Math.round(contrastRatio * 100) / 100,
          accessibilityScore: getAccessibilityScore(contrastRatio)
        };
      });
    }, this.CTA_SELECTORS, maxCTAs);
  }

  /**
   * Analyze the extracted CTA data to provide insights
   */
  private static analyzeCTAData(ctaData: CTAStyleData[]): CTAAnalysisResult {
    const totalCTAs = ctaData.length;
    const viewportHeight = 768; // Our set viewport height

    // Color analysis
    const backgroundColors = [...new Set(ctaData.map(cta => cta.styles.backgroundColor))];
    const textColors = [...new Set(ctaData.map(cta => cta.styles.color))];
    const contrastIssues = ctaData.filter(cta => cta.accessibilityScore === 'Fail').length;

    // Size analysis (typical CTA button sizes)
    const sizeCategories = ctaData.reduce((acc, cta) => {
      const area = cta.dimensions.width * cta.dimensions.height;
      if (area < 1600) acc.tooSmall++; // Less than 40x40px
      else if (area > 15000) acc.tooLarge++; // More than ~150x100px
      else acc.optimal++;
      return acc;
    }, { tooSmall: 0, optimal: 0, tooLarge: 0 });

    // Position analysis
    const positionCategories = ctaData.reduce((acc, cta) => {
      if (cta.position.y < viewportHeight) acc.aboveFold++;
      else acc.belowFold++;
      if (cta.styles.position === 'fixed') acc.fixed++;
      return acc;
    }, { aboveFold: 0, belowFold: 0, fixed: 0 });

    // Calculate averages
    const avgWidth = totalCTAs > 0 ? ctaData.reduce((sum, cta) => sum + cta.dimensions.width, 0) / totalCTAs : 0;
    const avgHeight = totalCTAs > 0 ? ctaData.reduce((sum, cta) => sum + cta.dimensions.height, 0) / totalCTAs : 0;

    return {
      totalCTAs,
      analyzedCTAs: ctaData,
      skippedCount: 0, // We filter during extraction
      averageSize: {
        width: Math.round(avgWidth),
        height: Math.round(avgHeight)
      },
      colorAnalysis: {
        uniqueBackgroundColors: backgroundColors,
        uniqueTextColors: textColors,
        hasGoodContrast: contrastIssues === 0,
        contrastIssues
      },
      sizingAnalysis: sizeCategories,
      positioningAnalysis: positionCategories
    };
  }
}
