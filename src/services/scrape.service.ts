import axios from 'axios';
import * as cheerio from 'cheerio';
import { generateHeaders } from '../utils/helpers.js';
import { ScrapeHelpers } from '../utils/scrape-helpers.js';
import { CTAS } from '../utils/constants.js';
import { PageData, PageMeta, PageHeaders, WordCloudData, HeaderStructureAnalysis } from '../types/index.js';

export class ScrapeService {
  
  static extractMeta($: cheerio.CheerioAPI): PageMeta {
    return {
      title: $('title').first().text().trim() || '',
      description: $('meta[name="description"]').attr('content') || '',
      keywords: $('meta[name="keywords"]').attr('content')?.split(',').map(k => k.trim()) || [],
      language: $('html').attr('lang') || 'en',
      charset: $('meta[charset]').attr('charset') || 'UTF-8',
      viewport: $('meta[name="viewport"]').attr('content') || 'width=device-width, initial-scale=1.0',
      canonical: $('link[rel="canonical"]').attr('href') || ''
    };
  }

  static extractHeaders($: cheerio.CheerioAPI): PageHeaders {
    return {
      h1: ScrapeHelpers.extractCleanH1($) || '',
      h2: $('h2').map((_, el) => $(el).text().trim()).get(),
      h3: $('h3').map((_, el) => $(el).text().trim()).get(),
      h4: $('h4').map((_, el) => $(el).text().trim()).get(),
      h5: $('h5').map((_, el) => $(el).text().trim()).get(),
      h6: $('h6').map((_, el) => $(el).text().trim()).get()
    };
  }

  static analyzeHeaderStructure($: cheerio.CheerioAPI): {
    hasLogicalOrder: boolean;
    structureIssues: string[];
    headerCount: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
  } {
    const headerCount = {
      h1: $('h1').length,
      h2: $('h2').length,
      h3: $('h3').length,
      h4: $('h4').length,
      h5: $('h5').length,
      h6: $('h6').length
    };

    const structureIssues: string[] = [];
    let hasLogicalOrder = true;

    // Check for multiple H1s
    if (headerCount.h1 === 0) {
      structureIssues.push('Missing H1 tag');
      hasLogicalOrder = false;
    } else if (headerCount.h1 > 1) {
      structureIssues.push(`Multiple H1 tags found (${headerCount.h1})`);
      hasLogicalOrder = false;
    }

    // Check for logical hierarchy (H1 should come before H2, H2 before H3, etc.)
    const headerElements = $('h1, h2, h3, h4, h5, h6').toArray();
    let lastLevel = 0;

    headerElements.forEach((el, index) => {
      const currentLevel = parseInt(el.tagName.charAt(1));
      
      if (index === 0 && currentLevel !== 1) {
        structureIssues.push(`First heading is H${currentLevel}, should be H1`);
        hasLogicalOrder = false;
      }
      
      if (currentLevel > lastLevel + 1) {
        structureIssues.push(`Header level jumps from H${lastLevel} to H${currentLevel} (skipped levels)`);
        hasLogicalOrder = false;
      }
      
      lastLevel = currentLevel;
    });

    // Check for empty headers
    const emptyHeaders = headerElements.filter(el => !$(el).text().trim());
    if (emptyHeaders.length > 0) {
      structureIssues.push(`${emptyHeaders.length} empty header(s) found`);
      hasLogicalOrder = false;
    }

    return {
      hasLogicalOrder,
      structureIssues,
      headerCount
    };
  }

  static extractCTAs($: cheerio.CheerioAPI): string[] {
    return $('a, button').filter((_: any, el: any) =>
      CTAS.some(cta => $(el).text().toLowerCase().includes(cta.toLowerCase()))
    ).map((_, el) => $(el).text().trim()).get().slice(0, 5); // Extract, trim text content, and limit to 5
  }

  static extractTrustSignals($: cheerio.CheerioAPI): {
    hasSSLIndicators: boolean;
    hasPaymentLogos: boolean;
    hasSecurityBadges: boolean;
    hasTestimonials: boolean;
    hasReviews: boolean;
    hasPrivacyPolicy: boolean;
    hasRefundPolicy: boolean;
  } {
    const trustKeywords = {
      ssl: ['ssl', 'secure', 'https', 'encrypt', 'security'],
      payment: ['visa', 'mastercard', 'paypal', 'stripe', 'payment', 'checkout'],
      security: ['verified', 'certified', 'badge', 'trust', 'guarantee', 'safe'],
      testimonials: ['testimonial', 'review', 'feedback', 'customer', 'client'],
      privacy: ['privacy', 'policy', 'gdpr', 'data protection'],
      refund: ['refund', 'money back', 'guarantee', 'return policy']
    };

    const pageText = $('body').text().toLowerCase();
    const links = $('a').map((_, el) => $(el).text().toLowerCase() + ' ' + ($(el).attr('href') || '')).get().join(' ');
    const images = $('img').map((_, el) => ($(el).attr('alt') || '') + ' ' + ($(el).attr('src') || '')).get().join(' ').toLowerCase();
    const allContent = pageText + ' ' + links + ' ' + images;

    return {
      hasSSLIndicators: trustKeywords.ssl.some(keyword => allContent.includes(keyword)),
      hasPaymentLogos: trustKeywords.payment.some(keyword => allContent.includes(keyword)),
      hasSecurityBadges: trustKeywords.security.some(keyword => allContent.includes(keyword)),
      hasTestimonials: trustKeywords.testimonials.some(keyword => allContent.includes(keyword)),
      hasReviews: $('[class*="review"], [id*="review"], .testimonial, .feedback').length > 0,
      hasPrivacyPolicy: trustKeywords.privacy.some(keyword => links.includes(keyword)),
      hasRefundPolicy: trustKeywords.refund.some(keyword => allContent.includes(keyword))
    };
  }

  static extractAnalyticsTracking($: cheerio.CheerioAPI): {
    hasGoogleAnalytics: boolean;
    hasGTM: boolean;
    hasFacebookPixel: boolean;
    hasHotjar: boolean;
    hasOtherTracking: boolean;
  } {
    const scripts = $('script').map((_, el) => $(el).html() || '').get().join(' ');
    const scriptSrcs = $('script[src]').map((_, el) => $(el).attr('src') || '').get().join(' ');
    const allScripts = scripts + ' ' + scriptSrcs;

    return {
      hasGoogleAnalytics: allScripts.includes('google-analytics') || allScripts.includes('gtag') || allScripts.includes('analytics.js'),
      hasGTM: allScripts.includes('googletagmanager') || allScripts.includes('gtm.js'),
      hasFacebookPixel: allScripts.includes('facebook') && allScripts.includes('pixel'),
      hasHotjar: allScripts.includes('hotjar'),
      hasOtherTracking: allScripts.includes('mixpanel') || allScripts.includes('amplitude') || allScripts.includes('segment')
    };
  }

  static extractForms($: cheerio.CheerioAPI): Array<{
    inputs: number;
    requiredFields: number;
    buttons: number;
    hasEmailField: boolean;
    hasPhoneField: boolean;
    hasNameField: boolean;
  }> {
    return $('form').map((_, form) => {
      const $form = $(form);
      const inputs = $form.find('input, textarea, select').length;
      const requiredFields = $form.find('[required], .required').length;
      const buttons = $form.find('button, input[type="submit"]').length;
      
      const fieldNames = $form.find('input, textarea, select').map((_, field) => {
        const name = $(field).attr('name') || '';
        const id = $(field).attr('id') || '';
        const placeholder = $(field).attr('placeholder') || '';
        return (name + ' ' + id + ' ' + placeholder).toLowerCase();
      }).get().join(' ');

      return {
        inputs,
        requiredFields,
        buttons,
        hasEmailField: fieldNames.includes('email') || fieldNames.includes('mail'),
        hasPhoneField: fieldNames.includes('phone') || fieldNames.includes('tel'),
        hasNameField: fieldNames.includes('name') || fieldNames.includes('first') || fieldNames.includes('last')
      };
    }).get();
  }

  static extractBodyText($: cheerio.CheerioAPI): string {
    $('script, style, nav, footer, header').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  }

  static getWordCount(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  static generateWordCloud(text: string): WordCloudData[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const wordCount: { [key: string]: number } = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 50)
      .map(([text, count]) => ({ text, size: count }));
  }

  static getTextToHtmlRatio(html: string): number {
    const $ = cheerio.load(html);
    const text = $('body').text();
    return Math.round((text.length / html.length) * 100) / 100;
  }

  static async scrapePage(url: string): Promise<PageData> {
    console.log(`🔍 Scraping: ${url}`);
    
    const response = await axios.get(url, { 
      timeout: 30000, 
      headers: generateHeaders() 
    });

    const html = response.data;
    const $ = cheerio.load(html);

    const meta = this.extractMeta($);
    const headers = this.extractHeaders($);
    const headerStructure = this.analyzeHeaderStructure($);
    const ctas = this.extractCTAs($);
    const bodyText = this.extractBodyText($);
    const wordCount = this.getWordCount(bodyText);
    const wordCloudData = this.generateWordCloud(bodyText);
    const textToHtmlRatio = this.getTextToHtmlRatio(html);
    const trustSignals = this.extractTrustSignals($);
    const analyticsTracking = this.extractAnalyticsTracking($);
    const forms = this.extractForms($);

    const robotsMeta = $('meta[name="robots"]').attr('content') || '';
    const isRobotsDoFollow = !robotsMeta.includes('noindex');
    const hasViewportMetaTag = $('meta[name="viewport"]').length > 0;
    const hasSingleH1 = $('h1').length === 1;

    return {
      url,
      pagePath: new URL(url).pathname,
      meta,
      isRobotsDoFollow,
      hasViewportMetaTag,
      canonical: meta.canonical || url,
      ctas,
      bodyText: bodyText.substring(0, 1000), // Keep first 1000 chars for storage
      wordCount,
      wordCloudData,
      textToHtmlRatio,
      headers,
      headerStructure,
      hasSingleH1,
      trustSignals,
      analyticsTracking,
      forms,
      screenshots: {} // Will be populated by screenshot service
    };
  }
}
