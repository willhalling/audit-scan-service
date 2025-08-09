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
      includeCompetitors?: boolean;
      keywords?: string[] | undefined;
      competitorLimit?: number;
    } = {}
  ): Promise<MozAnalysisResult> {
    const {
      auditId,
      saveToFirestore = false,
      includeKeywords = true,
      includeCompetitors = true,
      keywords,
      competitorLimit = 10
    } = options;

    console.log(`🔍 MOZ Integration: Analyzing ${url}`);

    try {
      // Get comprehensive MOZ analysis
      const mozData = await MozService.getFullAnalysis(url, {
        includeKeywords,
        includeCompetitors,
        keywords: keywords || undefined,
        competitorLimit
      });

      // Save to Firestore if requested and audit ID provided
      if (saveToFirestore && auditId) {
        try {
          // Save as separate collection document
          await firebaseService.saveMozAnalysis(auditId, url, mozData);
          
          // Also try to save to page data if page exists
          try {
            await firebaseService.saveMozDataToPage(auditId, url, mozData);
            console.log(`✅ MOZ data saved to both page and separate collection`);
          } catch (pageError) {
            console.log(`⚠️  MOZ data saved to collection only (page not found in audit)`);
          }
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
      includeCompetitors?: boolean;
      keywords?: string[] | undefined;
      competitorLimit?: number;
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

      // Analyze all pages with MOZ
      const mozResults = await this.analyzePages(urls, {
        auditId,
        saveToFirestore: true,
        includeKeywords: true,
        includeCompetitors: true,
        competitorLimit: 5 // Smaller limit for batch processing
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
    totalCompetitors: number;
    topKeywords: Array<{ keyword: string; difficulty: number; volume: number }>;
    topCompetitors: Array<{ url: string; domainAuthority: number; competitionLevel: string }>;
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
          totalCompetitors: 0,
          topKeywords: [],
          topCompetitors: []
        };
      }

      // Calculate averages
      const validMetrics = mozAnalyses.filter(analysis => !analysis.data.metrics.error);
      const totalDA = validMetrics.reduce((sum, analysis) => sum + analysis.data.metrics.domainAuthority, 0);
      const totalPA = validMetrics.reduce((sum, analysis) => sum + analysis.data.metrics.pageAuthority, 0);

      // Collect all keywords and competitors
      const allKeywords = mozAnalyses.flatMap(analysis => analysis.data.keywords || []);
      const allCompetitors = mozAnalyses.flatMap(analysis => analysis.data.competitors || []);

      // Get top keywords by priority
      const topKeywords = allKeywords
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 10)
        .map(k => ({ keyword: k.keyword, difficulty: k.difficulty, volume: k.volume }));

      // Get top competitors by domain authority
      const uniqueCompetitors = Array.from(
        new Map(allCompetitors.map(c => [c.url, c])).values()
      );
      const topCompetitors = uniqueCompetitors
        .sort((a, b) => b.domainAuthority - a.domainAuthority)
        .slice(0, 10)
        .map(c => ({ url: c.url, domainAuthority: c.domainAuthority, competitionLevel: c.competitionLevel || 'unknown' }));

      return {
        totalPages: mozAnalyses.length,
        pagesWithMozData: validMetrics.length,
        averageDomainAuthority: validMetrics.length > 0 ? Math.round(totalDA / validMetrics.length) : 0,
        averagePageAuthority: validMetrics.length > 0 ? Math.round(totalPA / validMetrics.length) : 0,
        totalKeywords: allKeywords.length,
        totalCompetitors: uniqueCompetitors.length,
        topKeywords,
        topCompetitors
      };

    } catch (error) {
      console.error(`❌ Failed to get MOZ summary for audit ${auditId}:`, error);
      throw error;
    }
  }
}
