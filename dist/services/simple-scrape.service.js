import axios from 'axios';
import * as cheerio from 'cheerio';
import { generateHeaders } from '../utils/helpers.js';
export class SimpleScrapeService {
    static extractMeta($) {
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
    static extractHeaders($) {
        return {
            h1: $('h1').first().text().trim() || '',
            h2: $('h2').map((_, el) => $(el).text().trim()).get(),
            h3: $('h3').map((_, el) => $(el).text().trim()).get(),
            h4: $('h4').map((_, el) => $(el).text().trim()).get(),
            h5: $('h5').map((_, el) => $(el).text().trim()).get(),
            h6: $('h6').map((_, el) => $(el).text().trim()).get()
        };
    }
    static extractCTAs($) {
        const ctaTexts = ['contact', 'buy', 'shop', 'get started', 'learn more', 'sign up', 'download'];
        return $('a, button').filter((_, el) => ctaTexts.some(cta => $(el).text().toLowerCase().includes(cta))).map((_, el) => $(el).text().trim()).get().slice(0, 5);
    }
    static extractBodyText($) {
        $('script, style, nav, footer, header').remove();
        return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 1000);
    }
    static getTextToHtmlRatio(html) {
        const $ = cheerio.load(html);
        const text = $('body').text();
        return Math.round((text.length / html.length) * 100) / 100;
    }
    static async scrapePage(url) {
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
            hasSingleH1,
            screenshots: []
        };
    }
}
//# sourceMappingURL=simple-scrape.service.js.map