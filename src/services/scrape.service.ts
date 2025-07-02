import axios from 'axios';
import * as cheerio from 'cheerio';
import { generateHeaders } from '../utils/helpers.js';
import { CTAS } from '../utils/constants.js';
import { PageData, PageMeta, PageHeaders, WordCloudData } from '../types/index.js';

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
      h1: $('h1').first().text().trim() || '',
      h2: $('h2').map((_, el) => $(el).text().trim()).get(),
      h3: $('h3').map((_, el) => $(el).text().trim()).get(),
      h4: $('h4').map((_, el) => $(el).text().trim()).get(),
      h5: $('h5').map((_, el) => $(el).text().trim()).get(),
      h6: $('h6').map((_, el) => $(el).text().trim()).get()
    };
  }

  static extractCTAs($: cheerio.CheerioAPI): string[] {
    return $('a, button').filter((_: any, el: any) =>
      CTAS.some(cta => $(el).text().toLowerCase().includes(cta.toLowerCase()))
    ).map((_, el) => $(el).text().trim()).get().slice(0, 5); // Extract, trim text content, and limit to 5
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
    const ctas = this.extractCTAs($);
    const bodyText = this.extractBodyText($);
    const wordCount = this.getWordCount(bodyText);
    const wordCloudData = this.generateWordCloud(bodyText);
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
      bodyText: bodyText.substring(0, 1000), // Keep first 1000 chars for storage
      wordCount,
      wordCloudData,
      textToHtmlRatio,
      headers,
      hasSingleH1,
      screenshots: {} // Will be populated by screenshot service
    };
  }
}
