import * as cheerio from 'cheerio';
import { PageData, PageMeta, PageHeaders } from '../types/index.js';
export declare class ScrapeService {
    static extractMeta($: cheerio.CheerioAPI): PageMeta;
    static extractHeaders($: cheerio.CheerioAPI): PageHeaders;
    static extractCTAs($: cheerio.CheerioAPI): string[];
    static extractBodyText($: cheerio.CheerioAPI): string;
    static getTextToHtmlRatio(html: string): number;
    static scrapePage(url: string): Promise<PageData>;
}
//# sourceMappingURL=scrape.service.d.ts.map