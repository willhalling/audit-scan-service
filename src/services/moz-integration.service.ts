import { MozService } from './moz.service.js';
import { firebaseService } from './firebase.service.js';
import { MozAnalysisResult } from '../types/index.js';

export class MozIntegrationService {
  
  /**
   * Get MOZ data for a URL and optionally save it to Firestore
   */
  static async analyzePage(
    url: string,
    options: {
      auditId?: string;
      saveToFirestore?: boolean;
      includeKeywords?: boolean;
      keywords?: string[] | undefined;
    } = {}
  ): Promise<MozAnalysisResult> {
    const {
      auditId,
      saveToFirestore = false,
      includeKeywords = true,
      keywords
    } = options;

    console.log(`🔍 MOZ Integration: Analyzing ${url}`);

    try {
      // Get comprehensive MOZ analysis (updated for new focused approach)
      const mozData = await MozService.getFullAnalysis(url, {
        includeKeywords,
        keywords: keywords || undefined
      });

      // Save to Firestore if requested and audit ID provided
      if (saveToFirestore && auditId) {
        try {
          // Only save to page data (no separate collection needed)
          await firebaseService.saveMozDataToPage(auditId, url, mozData);
          console.log(`✅ MOZ data saved to page in audit`);
        } catch (error) {
          console.error(`❌ Failed to save MOZ data to Firestore:`, error);
        }
      }

      return mozData;

    } catch (error) {
      console.error(`❌ MOZ Integration failed for ${url}:`, error);
      
      // Return error result
      return {
        url,
        metrics: {
          url,
          domainAuthority: 0,
          pageAuthority: 0,
          spamScore: 0,
          linkingDomains: 0,
          totalLinks: 0,
          mozRank: 0,
          mozTrust: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze multiple pages and optionally save to Firestore
   */
  static async analyzePages(
    urls: string[],
    options: {
      auditId?: string;
      saveToFirestore?: boolean;
      includeKeywords?: boolean;
      keywords?: string[] | undefined;
      batchDelay?: number;
    } = {}
  ): Promise<MozAnalysisResult[]> {
    const {
      batchDelay = 2000, // 2 second delay between pages to respect rate limits
      ...analysisOptions
    } = options;

    console.log(`🔍 MOZ Integration: Analyzing ${urls.length} pages`);

    const results: MozAnalysisResult[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`📊 Processing ${i + 1}/${urls.length}: ${url}`);

      try {
        const result = await this.analyzePage(url, analysisOptions);
        results.push(result);

        // Add delay between requests (except for the last one)
        if (i < urls.length - 1) {
          console.log(`⏱️  Waiting ${batchDelay}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }

      } catch (error) {
        console.error(`❌ Failed to analyze ${url}:`, error);
        
        // Add error result
        results.push({
          url,
          metrics: {
            url,
            domainAuthority: 0,
            pageAuthority: 0,
            spamScore: 0,
            linkingDomains: 0,
            totalLinks: 0,
            mozRank: 0,
            mozTrust: 0,
            error: error instanceof Error ? error.message : 'Batch analysis error'
          },
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Batch analysis error'
        });
      }
    }

    return results;
  }

  /**
   * Add MOZ data to an existing audit
   */
  static async enhanceAuditWithMozData(auditId: string): Promise<{ success: boolean; message: string; processedUrls: number }> {
    console.log(`🔍 MOZ Integration: Enhancing audit ${auditId} with MOZ data`);

    try {
      // Get the audit data
      const audit = await firebaseService.getAudit(auditId);
      if (!audit) {
        return { success: false, message: 'Audit not found', processedUrls: 0 };
      }

      if (!audit.pages || audit.pages.length === 0) {
        return { success: false, message: 'No pages found in audit', processedUrls: 0 };
      }

      // Extract unique URLs from pages
      const urls = [...new Set(audit.pages.map(page => page.url))];
      
      console.log(`📊 Found ${urls.length} unique URLs to analyze`);

      // Get AI keywords from the first page if available
      const firstPage = audit.pages[0];
      const aiKeywords = firstPage.ai?.meta?.keywords || undefined;

      // Analyze all pages with MOZ
      const mozResults = await this.analyzePages(urls, {
        auditId,
        saveToFirestore: true,
        includeKeywords: true,
        keywords: aiKeywords
      });

      const successfulAnalyses = mozResults.filter(result => !result.error);
      
      return {
        success: true,
        message: `Successfully enhanced ${successfulAnalyses.length}/${urls.length} pages with MOZ data`,
        processedUrls: successfulAnalyses.length
      };

    } catch (error) {
      console.error(`❌ Failed to enhance audit ${auditId} with MOZ data:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        processedUrls: 0
      };
    }
  }

  /**
   * Get MOZ summary for an audit
   */
  static async getAuditMozSummary(auditId: string): Promise<{
    totalPages: number;
    pagesWithMozData: number;
    averageDomainAuthority: number;
    averagePageAuthority: number;
    totalKeywords: number;
    topKeywords: Array<{ keyword: string; difficulty: number; volume: number }>;
  }> {
    console.log(`📊 Getting MOZ summary for audit ${auditId}`);

    try {
      const mozAnalyses = await firebaseService.getAllMozDataForAudit(auditId);
      
      if (mozAnalyses.length === 0) {
        return {
          totalPages: 0,
          pagesWithMozData: 0,
          averageDomainAuthority: 0,
          averagePageAuthority: 0,
          totalKeywords: 0,
          topKeywords: []
        };
      }

      // Calculate averages
      const validMetrics = mozAnalyses.filter(analysis => !analysis.data.metrics.error);
      const totalDA = validMetrics.reduce((sum, analysis) => sum + analysis.data.metrics.domainAuthority, 0);
      const totalPA = validMetrics.reduce((sum, analysis) => sum + analysis.data.metrics.pageAuthority, 0);

      // Collect all keywords
      const allKeywords = mozAnalyses.flatMap(analysis => analysis.data.keywords || []);

      // Get top keywords by priority/relevance
      const topKeywords = allKeywords
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, 10)
        .map(k => ({ keyword: k.keyword, difficulty: k.difficulty, volume: k.volume }));

      return {
        totalPages: mozAnalyses.length,
        pagesWithMozData: validMetrics.length,
        averageDomainAuthority: validMetrics.length > 0 ? Math.round(totalDA / validMetrics.length) : 0,
        averagePageAuthority: validMetrics.length > 0 ? Math.round(totalPA / validMetrics.length) : 0,
        totalKeywords: allKeywords.length,
        topKeywords
      };

    } catch (error) {
      console.error(`❌ Failed to get MOZ summary for audit ${auditId}:`, error);
      throw error;
    }
  }
}
