import axios from 'axios';
import * as cheerio from 'cheerio';
import { generateHeaders } from '../utils/helpers.js';
import { ScrapeHelpers } from '../utils/scrape-helpers.js';
import { PageData, PageMeta, PageHeaders, HeaderStructureAnalysis } from '../types/index.js';

export class SimpleScrapeService {
  
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

  static extractCTAs($: cheerio.CheerioAPI): string[] {
    const ctaTexts = ['contact', 'buy', 'shop', 'get started', 'learn more', 'sign up', 'download'];
    return $('a, button').filter((_, el) =>
      ctaTexts.some(cta => $(el).text().toLowerCase().includes(cta))
    ).map((_, el) => $(el).text().trim()).get().slice(0, 5);
  }

  static extractBodyText($: cheerio.CheerioAPI): string {
    $('script, style, nav, footer, header').remove();
    return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 1000);
  }

  static getTextToHtmlRatio(html: string): number {
    const $ = cheerio.load(html);
    const text = $('body').text();
    return Math.round((text.length / html.length) * 100) / 100;
  }

  static analyzeHeaderStructure($: cheerio.CheerioAPI): HeaderStructureAnalysis {
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
    const textToHtmlRatio = this.getTextToHtmlRatio(html);

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
      bodyText,
      textToHtmlRatio,
      headers,
      headerStructure,
      hasSingleH1,
      screenshots: {} // Will be populated by screenshot service
    };
  }
}
