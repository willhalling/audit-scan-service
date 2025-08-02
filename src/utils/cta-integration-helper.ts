import { CTAAnalysisService } from '../services/cta-analysis.service.js';
import { PageData } from '../types/index.js';

/**
 * Example integration of CTA Analysis Service
 * This shows how to integrate CTA visual analysis into your existing audit flow
 */

export async function enhancePageDataWithCTAAnalysis(
  pageData: PageData,
  options: {
    enableCTAAnalysis?: boolean;
    maxCTAs?: number;
    browser?: any; // Your existing browser instance
  } = {}
): Promise<PageData> {
  
  const { 
    enableCTAAnalysis = true, 
    maxCTAs = 3,
    browser 
  } = options;

  // Add CTA visual analysis if enabled
  if (enableCTAAnalysis && pageData.ctas.length > 0) {
    try {
      const ctaAnalysis = await CTAAnalysisService.analyzeCTAs(
        pageData.url,
        {
          enabled: enableCTAAnalysis,
          maxCTAs,
          browser,
          useExistingBrowser: !!browser // Use existing browser if provided
        }
      );

      if (ctaAnalysis) {
        pageData.ctaAnalysis = ctaAnalysis;
        console.log(`✅ Enhanced page data with CTA visual analysis: ${ctaAnalysis.analyzedCTAs.length} CTAs analyzed`);
      }
    } catch (error) {
      console.error('❌ Failed to enhance page data with CTA analysis:', error);
      // Don't fail the entire audit if CTA analysis fails
    }
  } else {
    console.log('🚫 CTA visual analysis skipped (disabled or no CTAs found)');
  }

  return pageData;
}

/**
 * Configuration helper for different environments
 */
export const CTAAnalysisConfig = {
  // Development: Analyze more CTAs for testing
  development: {
    enableCTAAnalysis: true,
    maxCTAs: 5
  },
  
  // Production: Optimize for performance
  production: {
    enableCTAAnalysis: true,
    maxCTAs: 3
  },
  
  // Fast mode: Skip CTA analysis for speed
  fast: {
    enableCTAAnalysis: false,
    maxCTAs: 0
  },
  
  // Comprehensive: Analyze all CTAs (use carefully)
  comprehensive: {
    enableCTAAnalysis: true,
    maxCTAs: 10
  }
};

/**
 * Usage example:
 * 
 * // In your audit service
 * const pageData = await scrapePageData(url);
 * const enhancedPageData = await enhancePageDataWithCTAAnalysis(
 *   pageData, 
 *   CTAAnalysisConfig.production
 * );
 * 
 * // Now use enhancedPageData with conversion optimization
 * const conversionAnalysis = await ConversionOptimizationService.analyzePageForConversion(
 *   enhancedPageData
 * );
 */
