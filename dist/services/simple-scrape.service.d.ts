import * as cheerio from 'cheerio';
import { PageData, PageMeta, PageHeaders } from '../types/index.js';
export declare class SimpleScrapeService {
    static extractMeta($: cheerio.CheerioAPI): PageMeta;
    static extractHeaders($: cheerio.CheerioAPI): PageHeaders;
    static extractCTAs($: cheerio.CheerioAPI): string[];
    static extractBodyText($: cheerio.CheerioAPI): string;
    static getTextToHtmlRatio(html: string): number;
    static scrapePage(url: string): Promise<PageData>;
}
//# sourceMappingURL=simple-scrape.service.d.ts.map