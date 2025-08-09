import axios from 'axios';
import { MozMetrics, MozKeywordData, MozCompetitorData, MozAnalysisResult } from '../types/index.js';

export interface MozApiResponse {
  results?: Array<{
    url: string;
    domain_authority?: number;
    page_authority?: number;
    spam_score?: number;
    linking_domains?: number;
    external_links?: number;
    mozrank_url?: number;
    moztrust_url?: number;
    last_crawled?: string;
    title?: string;
  }>;
  error?: {
    message: string;
    status: number;
  };
}

export interface MozKeywordApiResponse {
  results?: Array<{
    keyword: string;
    difficulty?: number;
    volume?: number;
    opportunity?: number;
    potential?: number;
    ctr?: number;
    priority?: number;
  }>;
  error?: {
    message: string;
    status: number;
  };
}

export interface MozCompetitorApiResponse {
  results?: Array<{
    url: string;
    domain_authority?: number;
    page_authority?: number;
    linking_domains?: number;
    external_links?: number;
    common_keywords?: number;
  }>;
  error?: {
    message: string;
    status: number;
  };
}

export interface MozRateLimitInfo {
  remaining: number;
  resetTime: number;
  total: number;
}

export class MozService {
  private static readonly BASE_URL = 'https://lsapi.seomoz.com/v2';
  private static readonly TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_RATE_LIMIT_DELAY = 1000; // 1 second between requests
  private static lastRequestTime = 0;
  private static rateLimitInfo: MozRateLimitInfo | null = null;

  /**
   * Check if MOZ API is enabled via environment flag
   */
  static isEnabled(): boolean {
    const enabled = process.env.MOZ_ENABLED;
    return enabled === 'true' || enabled === '1';
  }

  /**
   * Apply rate limiting delay
   */
  private static async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.DEFAULT_RATE_LIMIT_DELAY) {
      const delay = this.DEFAULT_RATE_LIMIT_DELAY - timeSinceLastRequest;
      console.log(`⏱️  Applying rate limit delay: ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Parse rate limit headers from response
   */
  private static parseRateLimitHeaders(headers: Record<string, unknown>): MozRateLimitInfo | null {
    try {
      const remaining = parseInt(String(headers['x-ratelimit-remaining'] || '0'));
      const total = parseInt(String(headers['x-ratelimit-limit'] || '0'));
      const resetTime = parseInt(String(headers['x-ratelimit-reset'] || '0'));
      
      if (remaining >= 0 && total > 0) {
        return { remaining, total, resetTime };
      }
    } catch (error) {
      console.warn('Failed to parse rate limit headers:', error);
    }
    return null;
  }

  /**
   * Get MOZ API credentials from environment
   */
  private static getCredentials(): { apiToken: string } {
    const apiToken = process.env.MOZ_API_TOKEN;

    if (!apiToken) {
      throw new Error('MOZ_API_TOKEN environment variable is required');
    }

    return { apiToken };
  }

  /**
   * Make authenticated request to MOZ API
   */
  private static async makeRequest(endpoint: string, data: Record<string, unknown>): Promise<{ data: MozApiResponse | MozKeywordApiResponse | MozCompetitorApiResponse; rateLimitInfo?: MozRateLimitInfo | null }> {
    try {
      if (!this.isEnabled()) {
        throw new Error('MOZ API is disabled. Set MOZ_ENABLED=true to enable.');
      }

      await this.applyRateLimit();

      const credentials = this.getCredentials();
      const authHeader = `Basic ${credentials.apiToken}`;
      console.log('🔑 Using MOZ API Token authentication');

      const response = await axios.post(`${this.BASE_URL}${endpoint}`, data, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'User-Agent': 'AuditScanService/1.0'
        },
        timeout: this.TIMEOUT
      });

      // Parse rate limit info
      const rateLimitInfo = this.parseRateLimitHeaders(response.headers as Record<string, unknown>);
      if (rateLimitInfo) {
        this.rateLimitInfo = rateLimitInfo;
        console.log(`📊 Rate limit: ${rateLimitInfo.remaining}/${rateLimitInfo.total} remaining`);
      }

      return { data: response.data, rateLimitInfo };
    } catch (error) {
      console.error('MOZ API request failed:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`MOZ API Error: ${error.response?.status} - ${error.response?.statusText}`);
      }
      throw error;
    }
  }

  /**
   * Get URL metrics from MOZ API
   */
  static async getUrlMetrics(url: string): Promise<MozMetrics> {
    console.log(`🔍 Getting MOZ metrics for: ${url}`);

    try {
      // Validate URL
      if (!url || typeof url !== 'string') {
        throw new Error('Valid URL is required');
      }

      // Ensure URL has protocol
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

      const requestData = {
        targets: [normalizedUrl],
        metrics: [
          'domain_authority',
          'page_authority', 
          'spam_score',
          'linking_domains',
          'external_links',
          'mozrank_url',
          'moztrust_url',
          'last_crawled',
          'title'
        ]
      };

      const response = await this.makeRequest('/url_metrics', requestData);
      const apiResponse = response.data as MozApiResponse;

      if (apiResponse.error) {
        throw new Error(`MOZ API Error: ${apiResponse.error.message}`);
      }

      if (!apiResponse.results || apiResponse.results.length === 0) {
        throw new Error('No metrics data returned from MOZ API');
      }

      const result = apiResponse.results[0];

      return {
        url: normalizedUrl,
        domainAuthority: result.domain_authority || 0,
        pageAuthority: result.page_authority || 0,
        spamScore: result.spam_score || 0,
        linkingDomains: result.linking_domains || 0,
        totalLinks: result.external_links || 0,
        mozRank: result.mozrank_url || 0,
        mozTrust: result.moztrust_url || 0,
        lastCrawled: result.last_crawled,
        title: result.title
      };

    } catch (error) {
      console.error(`❌ MOZ metrics failed for ${url}:`, error);
      
      return {
        url,
        domainAuthority: 0,
        pageAuthority: 0,
        spamScore: 0,
        linkingDomains: 0,
        totalLinks: 0,
        mozRank: 0,
        mozTrust: 0,
        error: error instanceof Error ? error.message : 'Unknown MOZ API error'
      };
    }
  }

  /**
   * Get metrics for multiple URLs (batch processing)
   */
  static async getBulkUrlMetrics(urls: string[]): Promise<MozMetrics[]> {
    console.log(`🔍 Getting MOZ metrics for ${urls.length} URLs`);

    if (!urls || urls.length === 0) {
      return [];
    }

    // MOZ API typically has a limit on batch requests (usually 100)
    const BATCH_SIZE = 50;
    const results: MozMetrics[] = [];

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      
      try {
        const normalizedUrls = batch.map(url => 
          url.startsWith('http') ? url : `https://${url}`
        );

        const requestData = {
          targets: normalizedUrls,
          metrics: [
            'domain_authority',
            'page_authority',
            'spam_score', 
            'linking_domains',
            'external_links',
            'mozrank_url',
            'moztrust_url',
            'last_crawled',
            'title'
          ]
        };

        const response = await this.makeRequest('/url_metrics', requestData);
        const apiResponse = response.data as MozApiResponse;

        if (apiResponse.results) {
          const batchResults = apiResponse.results.map((result, index) => ({
            url: normalizedUrls[index],
            domainAuthority: result.domain_authority || 0,
            pageAuthority: result.page_authority || 0,
            spamScore: result.spam_score || 0,
            linkingDomains: result.linking_domains || 0,
            totalLinks: result.external_links || 0,
            mozRank: result.mozrank_url || 0,
            mozTrust: result.moztrust_url || 0,
            lastCrawled: result.last_crawled,
            title: result.title
          }));

          results.push(...batchResults);
        }

        // Add delay between batches to respect rate limits
        if (i + BATCH_SIZE < urls.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ Batch MOZ request failed for batch starting at index ${i}:`, error);
        
        // Add error entries for failed batch
        const errorResults = batch.map(url => ({
          url,
          domainAuthority: 0,
          pageAuthority: 0,
          spamScore: 0,
          linkingDomains: 0,
          totalLinks: 0,
          mozRank: 0,
          mozTrust: 0,
          error: error instanceof Error ? error.message : 'Batch request failed'
        }));

        results.push(...errorResults);
      }
    }

    return results;
  }

  /**
   * Check if MOZ API is properly configured
   */
  static isConfigured(): boolean {
    const apiToken = process.env.MOZ_API_TOKEN;
    return !!apiToken;
  }

  /**
   * Get keyword data for a domain
   */
  static async getKeywordData(domain: string, keywords?: string[]): Promise<MozKeywordData[]> {
    console.log(`🔍 Getting MOZ keyword data for: ${domain}`);

    try {
      if (!this.isEnabled()) {
        console.log('⚠️  MOZ API is disabled');
        return [];
      }

      if (!this.isConfigured()) {
        throw new Error('MOZ API credentials not configured');
      }

      // Normalize domain
      const normalizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

      const requestData = {
        targets: [normalizedDomain],
        keywords: keywords || [], // Use provided keywords or let MOZ discover them
        limit: 50 // Limit to avoid excessive API usage
      };

      const response = await this.makeRequest('/keyword_suggestions', requestData);
      const apiResponse = response.data as MozKeywordApiResponse;

      if (apiResponse.error) {
        throw new Error(`MOZ Keyword API Error: ${apiResponse.error.message}`);
      }

      if (!apiResponse.results || apiResponse.results.length === 0) {
        console.log('No keyword data returned from MOZ API');
        return [];
      }

      return apiResponse.results.map(result => ({
        keyword: result.keyword,
        difficulty: result.difficulty || 0,
        volume: result.volume || 0,
        opportunity: result.opportunity || 0,
        potential: result.potential || 0,
        ctr: result.ctr || 0,
        priority: result.priority || 0
      }));

    } catch (error) {
      console.error(`❌ MOZ keyword research failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Get competitor analysis for a domain
   */
  static async getCompetitorData(domain: string, limit = 10): Promise<MozCompetitorData[]> {
    console.log(`🔍 Getting MOZ competitor data for: ${domain}`);

    try {
      if (!this.isEnabled()) {
        console.log('⚠️  MOZ API is disabled');
        return [];
      }

      if (!this.isConfigured()) {
        throw new Error('MOZ API credentials not configured');
      }

      // Normalize domain
      const normalizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

      const requestData = {
        targets: [normalizedDomain],
        limit: Math.min(limit, 50), // Cap at 50 to avoid excessive usage
        metrics: [
          'domain_authority',
          'page_authority',
          'linking_domains',
          'external_links',
          'common_keywords'
        ]
      };

      const response = await this.makeRequest('/competitor_analysis', requestData);
      const apiResponse = response.data as MozCompetitorApiResponse;

      if (apiResponse.error) {
        throw new Error(`MOZ Competitor API Error: ${apiResponse.error.message}`);
      }

      if (!apiResponse.results || apiResponse.results.length === 0) {
        console.log('No competitor data returned from MOZ API');
        return [];
      }

      return apiResponse.results.map(result => {
        const commonKeywords = result.common_keywords || 0;
        let competitionLevel: 'low' | 'medium' | 'high' = 'low';
        
        if (commonKeywords > 100) {
          competitionLevel = 'high';
        } else if (commonKeywords > 25) {
          competitionLevel = 'medium';
        }

        return {
          url: result.url,
          domainAuthority: result.domain_authority || 0,
          pageAuthority: result.page_authority || 0,
          linkingDomains: result.linking_domains || 0,
          totalLinks: result.external_links || 0,
          commonKeywords,
          competitionLevel
        };
      });

    } catch (error) {
      console.error(`❌ MOZ competitor analysis failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Get comprehensive MOZ analysis (metrics + keywords + competitors)
   */
  static async getFullAnalysis(url: string, options: {
    includeKeywords?: boolean;
    includeCompetitors?: boolean;
    keywords?: string[] | undefined;
    competitorLimit?: number;
  } = {}): Promise<MozAnalysisResult> {
    console.log(`🔍 Getting full MOZ analysis for: ${url}`);

    const {
      includeKeywords = true,
      includeCompetitors = true,
      keywords,
      competitorLimit = 10
    } = options;

    const timestamp = new Date().toISOString();

    try {
      if (!this.isEnabled()) {
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
            error: 'MOZ API is disabled'
          },
          timestamp,
          error: 'MOZ API is disabled. Set MOZ_ENABLED=true to enable.'
        };
      }

      // Get basic metrics first
      const metrics = await this.getUrlMetrics(url);

      const result: MozAnalysisResult = {
        url,
        metrics,
        timestamp,
        rateLimitRemaining: this.rateLimitInfo?.remaining
      };

      // Get keyword data if requested
      if (includeKeywords && !metrics.error) {
        try {
          const domain = url.replace(/^https?:\/\//, '').split('/')[0];
          result.keywords = await this.getKeywordData(domain, keywords);
        } catch (error) {
          console.warn('Failed to get keyword data:', error);
        }
      }

      // Get competitor data if requested
      if (includeCompetitors && !metrics.error) {
        try {
          const domain = url.replace(/^https?:\/\//, '').split('/')[0];
          result.competitors = await this.getCompetitorData(domain, competitorLimit);
        } catch (error) {
          console.warn('Failed to get competitor data:', error);
        }
      }

      return result;

    } catch (error) {
      console.error(`❌ Full MOZ analysis failed for ${url}:`, error);
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
        timestamp,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test MOZ API connectivity
   */
  static async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          message: 'MOZ API credentials not configured'
        };
      }

      // Test with a simple URL
      await this.getUrlMetrics('example.com');
      
      return {
        success: true,
        message: 'MOZ API connection successful'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown connection error'
      };
    }
  }
}
