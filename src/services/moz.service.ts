import { MozMetrics, MozKeywordData, MozCompetitorData, MozAnalysisResult } from '../types/index.js';

export interface MozApiResponse {
  result?: {
    site_metrics?: {
      page: string;
      title?: string;
      domain_authority?: number;
      page_authority?: number;
      spam_score?: number;
      root_domains_to_page?: number;
      external_pages_to_page?: number;
      last_crawled?: string;
      pages_to_page?: number;
      pages_to_subdomain?: number;
      pages_to_root_domain?: number;
    };
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface MozKeywordApiResponse {
  result?: {
    suggestions?: Array<{
      keyword: string;
      relevance?: number;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface MozCompetitorApiResponse {
  result?: {
    ranking_keywords?: Array<{
      keyword: string;
      ranking_page?: string;
      rank_position?: number;
      difficulty?: number;
      volume?: number;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface MozRateLimitInfo {
  remaining: number;
  resetTime: number;
  total: number;
}

export class MozService {
  private static readonly BASE_URL = 'https://api.moz.com';
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
   * Make authenticated request to MOZ JSON-RPC API
   */
  private static async makeRequest(method: string, params: Record<string, unknown>): Promise<{ data: MozApiResponse | MozKeywordApiResponse | MozCompetitorApiResponse; rateLimitInfo?: MozRateLimitInfo | null }> {
    try {
      if (!this.isEnabled()) {
        throw new Error('MOZ API is disabled. Set MOZ_ENABLED=true to enable.');
      }

      await this.applyRateLimit();

      const credentials = this.getCredentials();
      console.log('🔑 Using MOZ API Token authentication');

      const requestPayload = {
        jsonrpc: "2.0",
        id: `audit-scan-service-${method.replace(/\./g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method: method,
        params: {
          data: params
        }
      };

      const response = await fetch(`${this.BASE_URL}/jsonrpc`, {
        method: 'POST',
        headers: {
          'x-moz-token': credentials.apiToken,
          'Content-Type': 'application/json',
          'User-Agent': 'AuditScanService/1.0'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`MOZ API HTTP error: ${response.status} - ${response.statusText}`);
      }

      const responseData = await response.json();

      // Parse rate limit info from headers
      const rateLimitInfo = this.parseRateLimitHeaders(Object.fromEntries(response.headers.entries()));
      if (rateLimitInfo) {
        this.rateLimitInfo = rateLimitInfo;
        console.log(`📊 Rate limit: ${rateLimitInfo.remaining}/${rateLimitInfo.total} remaining`);
      }

      // Check for JSON-RPC error
      if (responseData.error) {
        throw new Error(`MOZ API Error: ${responseData.error.code} - ${responseData.error.message}`);
      }

      return { data: responseData, rateLimitInfo };
    } catch (error) {
      console.error('MOZ API request failed:', error);
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

      // Ensure URL has protocol and normalize
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      const domain = normalizedUrl.replace(/^https?:\/\//, '').split('/')[0];

      const params = {
        site_query: {
          query: domain,
          scope: "domain"
        }
      };

      const response = await this.makeRequest('data.site.metrics.fetch', params);
      const apiResponse = response.data as MozApiResponse;

      if (apiResponse.error) {
        throw new Error(`MOZ API Error: ${apiResponse.error.message}`);
      }

      if (!apiResponse.result?.site_metrics) {
        throw new Error('No metrics data returned from MOZ API');
      }

      const result = apiResponse.result.site_metrics;

      return {
        url: normalizedUrl,
        domainAuthority: result.domain_authority || 0,
        pageAuthority: result.page_authority || 0,
        spamScore: result.spam_score || 0,
        linkingDomains: result.root_domains_to_page || 0,
        totalLinks: result.external_pages_to_page || 0,
        mozRank: 0, // Not available in new API
        mozTrust: 0, // Not available in new API
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
   * Get metrics for multiple URLs (sequential processing since new API is single-site only)
   */
  static async getBulkUrlMetrics(urls: string[]): Promise<MozMetrics[]> {
    console.log(`🔍 Getting MOZ metrics for ${urls.length} URLs`);

    if (!urls || urls.length === 0) {
      return [];
    }

    const results: MozMetrics[] = [];

    // Process URLs sequentially to respect rate limits and API constraints
    for (let i = 0; i < urls.length; i++) {
      try {
        const result = await this.getUrlMetrics(urls[i]);
        results.push(result);

        // Add delay between requests to respect rate limits
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ MOZ request failed for URL ${urls[i]}:`, error);
        
        // Add error entry for failed request
        results.push({
          url: urls[i],
          domainAuthority: 0,
          pageAuthority: 0,
          spamScore: 0,
          linkingDomains: 0,
          totalLinks: 0,
          mozRank: 0,
          mozTrust: 0,
          error: error instanceof Error ? error.message : 'Request failed'
        });
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
   * Get keyword data for a domain - supports both ranking keywords and keyword suggestions
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

      // If specific keywords are provided, get suggestions for those keywords
      if (keywords && keywords.length > 0) {
        console.log(`🔍 Getting keyword suggestions for ${keywords.length} provided keywords`);
        return await this.getKeywordSuggestions(keywords);
      }

      // Otherwise, get ranking keywords for the domain (default behavior)
      console.log(`🔍 Getting ranking keywords for domain: ${normalizedDomain}`);
      const params = {
        target_query: {
          query: normalizedDomain,
          scope: "domain",
          locale: "en-US"
        },
        page: {
          n: 0,
          limit: 20
        },
        options: {
          sort: "rank"
        }
      };

      const response = await this.makeRequest('data.site.ranking-keyword.list', params);
      const apiResponse = response.data as MozCompetitorApiResponse;

      if (apiResponse.error) {
        throw new Error(`MOZ Keyword API Error: ${apiResponse.error.message}`);
      }

      if (!apiResponse.result?.ranking_keywords || apiResponse.result.ranking_keywords.length === 0) {
        console.log('No ranking keyword data returned from MOZ API');
        return [];
      }

      return apiResponse.result.ranking_keywords.map(result => ({
        keyword: result.keyword,
        difficulty: result.difficulty || 0,
        volume: Math.round((result.volume || 0) * 100) / 100, // Round volume to 2 decimal places
        opportunity: 0,
        potential: 0,
        ctr: 0,
        priority: 0,
        relevance: 100 - (result.rank_position || 50) // Higher relevance for better rankings
      }));

    } catch (error) {
      console.error(`❌ MOZ keyword research failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Get keyword suggestions for specific keywords using universal strategy
   */
  static async getKeywordSuggestions(keywords: string[]): Promise<MozKeywordData[]> {
    const allSuggestions: MozKeywordData[] = [];

    for (const keyword of keywords) {
      try {
        const params = {
          serp_query: {
            keyword: keyword,
            locale: "en-US",
            device: "desktop",
            engine: "google"
          },
          page: {
            n: 0,
            limit: 10
          },
          options: {
            strategy: "universal" // Use universal strategy as suggested by API
          }
        };

        const response = await this.makeRequest('data.keyword.suggestions.list', params);
        const apiResponse = response.data as MozKeywordApiResponse;

        if (apiResponse.error) {
          console.warn(`⚠️  Keyword suggestions failed for "${keyword}": ${apiResponse.error.message}`);
          continue; // Skip this keyword and continue with others
        }

        if (apiResponse.result?.suggestions && apiResponse.result.suggestions.length > 0) {
          const suggestions = apiResponse.result.suggestions.map(result => ({
            keyword: result.keyword,
            difficulty: 0, // Not available in suggestions endpoint
            volume: 0, // Not available in suggestions endpoint
            opportunity: 0,
            potential: 0,
            ctr: 0,
            priority: 0,
            relevance: Math.round((result.relevance || 0) * 100) / 100 // Round to 2 decimal places
          }));

          allSuggestions.push(...suggestions);
        }

        // Rate limiting between keyword requests
        if (keywords.indexOf(keyword) < keywords.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.warn(`⚠️  Failed to get suggestions for keyword "${keyword}":`, error);
      }
    }

    return allSuggestions;
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

      const params = {
        target_query: {
          query: normalizedDomain,
          scope: "domain",
          locale: "en-US"
        },
        page: {
          n: 0,
          limit: Math.min(limit, 50)
        },
        options: {
          sort: "rank"
        }
      };

      const response = await this.makeRequest('data.site.ranking-keyword.list', params);
      const apiResponse = response.data as MozCompetitorApiResponse;

      if (apiResponse.error) {
        throw new Error(`MOZ Competitor API Error: ${apiResponse.error.message}`);
      }

      if (!apiResponse.result?.ranking_keywords || apiResponse.result.ranking_keywords.length === 0) {
        console.log('No competitor data returned from MOZ API');
        return [];
      }

      // Group by ranking pages to create competitor data
      const competitorMap = new Map<string, {
        keywords: number;
        totalDifficulty: number;
        totalVolume: number;
      }>();

      apiResponse.result.ranking_keywords.forEach(result => {
        if (result.ranking_page) {
          const domain = new URL(result.ranking_page).hostname;
          const existing = competitorMap.get(domain) || { keywords: 0, totalDifficulty: 0, totalVolume: 0 };
          existing.keywords += 1;
          existing.totalDifficulty += result.difficulty || 0;
          existing.totalVolume += result.volume || 0;
          competitorMap.set(domain, existing);
        }
      });

      return Array.from(competitorMap.entries()).map(([url, data]) => {
        const commonKeywords = data.keywords;
        let competitionLevel: 'low' | 'medium' | 'high' = 'low';
        
        if (commonKeywords > 20) {
          competitionLevel = 'high';
        } else if (commonKeywords > 5) {
          competitionLevel = 'medium';
        }

        return {
          url,
          domainAuthority: 0, // Not available in this endpoint
          pageAuthority: 0, // Not available in this endpoint
          linkingDomains: 0, // Not available in this endpoint
          totalLinks: 0, // Not available in this endpoint
          commonKeywords,
          competitionLevel
        };
      }).slice(0, limit);

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
