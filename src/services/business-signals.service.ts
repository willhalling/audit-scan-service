import { Page } from 'puppeteer-core';
import { ScanPackage } from '../types/index.js';
import { RenderedExtraction, ExtractedAnchor } from './rendered-extract.service.js';

type BusinessSignals = ScanPackage['business'];

interface SignalSource {
  anchors: ExtractedAnchor[];
  text: string;
  structuredData: unknown[];
}

const PHONE_REGEX = /(?:\+44\s?|0)\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const BOOKING_DOMAINS = [
  'calendly.com', 'booksy.com', 'simplybook', 'acuityscheduling.com',
  'setmore.com', 'fresha.com', 'vagaro.com', 'timely', 'bookwhen.com',
  'appointy.com', 'youcanbook.me', 'oncehub.com', 'scheduleonce.com',
  'square.site', 'squareup.com/appointments', 'bookingbug', 'planity.com'
];

const SOCIAL_PLATFORMS: { platform: string; patterns: string[] }[] = [
  { platform: 'facebook', patterns: ['facebook.com/', 'fb.com/'] },
  { platform: 'instagram', patterns: ['instagram.com/'] },
  { platform: 'linkedin', patterns: ['linkedin.com/'] },
  { platform: 'tiktok', patterns: ['tiktok.com/'] },
  { platform: 'x', patterns: ['x.com/', 'twitter.com/'] },
  { platform: 'youtube', patterns: ['youtube.com/', 'youtu.be/'] }
];

const MAPS_PATTERNS = [
  'google.com/maps', 'maps.google.', 'maps.app.goo.gl', 'goo.gl/maps',
  'google.com/maps/embed', '/maps/place/'
];

const AWARD_KEYWORDS = ['award-winning', 'award winning', 'awards', 'winner of', 'voted best', 'best of'];
const CERT_KEYWORDS = ['certified', 'certification', 'iso 9001', 'iso9001', 'qualified', 'city & guilds', 'nvq', 'gas safe', 'niceic', 'oftec'];
const ACCREDITATION_KEYWORDS = ['accredited', 'accreditation', 'checkatrade', 'trustatrader', 'which? trusted trader', 'trading standards approved', 'buy with confidence', 'fmb member', 'member of'];
const GUARANTEE_KEYWORDS = ['guarantee', 'guaranteed', 'warranty', 'money-back', 'money back', 'satisfaction promise'];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Extract contact / trust / business signals from the rendered DOM,
 * structured data, and (optionally) a discovered contact page.
 */
export class BusinessSignalsService {
  static async collect(
    extraction: RenderedExtraction,
    page?: Page
  ): Promise<BusinessSignals> {
    console.log('🏢 Collecting business signals...');

    const sources: SignalSource[] = [
      {
        anchors: extraction.anchors,
        text: extraction.fullText,
        structuredData: extraction.structuredData
      }
    ];

    // Optional: follow a discovered /contact page with the same live page.
    if (page) {
      const contactHref = this.findContactLink(extraction);
      if (contactHref) {
        try {
          console.log(`📞 Fetching contact page for extra signals: ${contactHref}`);
          await page.goto(contactHref, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const contactData = await page.evaluate(() => {
            const anchors: { href: string; text: string }[] = [];
            document.querySelectorAll('a[href]').forEach((el) => {
              if (anchors.length >= 300) return;
              const href = el.getAttribute('href') || '';
              if (!href || href.startsWith('javascript:')) return;
              try {
                anchors.push({
                  href: new URL(href, document.baseURI).href,
                  text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
                });
              } catch {
                // ignore bad URLs
              }
            });
            const clone = document.body ? (document.body.cloneNode(true) as HTMLElement) : null;
            clone?.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove());
            const text = ((clone?.innerText || '') as string).replace(/\s+/g, ' ').trim().slice(0, 15000);
            return { anchors, text };
          });
          sources.push({ ...contactData, structuredData: [] });
        } catch (error) {
          console.warn('⚠️ Contact page fetch failed (continuing without it):', error);
        }
      }
    }

    const allAnchors = sources.flatMap((s) => s.anchors);
    const allHrefs = allAnchors.map((a) => a.href);
    const allText = sources.map((s) => s.text).join(' ');
    const allStructuredData = sources.flatMap((s) => s.structuredData);

    // --- Phones / emails -------------------------------------------------------
    const phones = unique([
      ...allHrefs.filter((h) => h.startsWith('tel:')).map((h) => h.replace(/^tel:/i, '').trim()),
      ...(allText.match(PHONE_REGEX) || []).map((p) => p.replace(/\s+/g, ' ').trim())
    ]).slice(0, 10);

    const emails = unique([
      ...allHrefs.filter((h) => h.startsWith('mailto:')).map((h) => h.replace(/^mailto:/i, '').split('?')[0].trim()),
      ...(allText.match(EMAIL_REGEX) || []).filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(e))
    ]).slice(0, 10);

    // --- Link-based signals -------------------------------------------------------
    const whatsappLinks = unique(
      allHrefs.filter((h) => h.includes('wa.me/') || h.includes('api.whatsapp.com'))
    ).slice(0, 5);

    const bookingLinks = unique(
      allHrefs.filter((h) => BOOKING_DOMAINS.some((d) => h.includes(d)))
    ).slice(0, 10);

    const googleMaps = unique(
      allHrefs.filter((h) => MAPS_PATTERNS.some((p) => h.includes(p)))
    ).slice(0, 5);

    const socialLinks: { platform: string; url: string }[] = [];
    for (const { platform, patterns } of SOCIAL_PLATFORMS) {
      const match = allHrefs.find((h) => patterns.some((p) => h.includes(p)));
      if (match) socialLinks.push({ platform, url: match });
    }

    // --- Structured data (LocalBusiness etc.) ----------------------------------------
    const localBusiness = this.findLocalBusiness(allStructuredData);
    const openingHours = this.extractOpeningHours(localBusiness);
    const serviceAreas = this.extractServiceAreas(localBusiness);
    const { ratingValue, reviewCount } = this.extractRating(localBusiness);

    // --- Keyword scans -------------------------------------------------------------------
    const lowerText = allText.toLowerCase();
    const hasReviews = /\breviews?\b|\brated\b|star rating|customer feedback/.test(lowerText);
    const hasTestimonials = /testimonials?|what our (customers|clients)|kind words/.test(lowerText);

    const findKeywordSnippets = (keywords: string[]): string[] => {
      const found = new Set<string>();
      for (const keyword of keywords) {
        const idx = lowerText.indexOf(keyword);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 30);
        const snippet = allText.slice(start, idx + keyword.length + 30).replace(/\s+/g, ' ').trim();
        found.add(snippet);
        if (found.size >= 5) break;
      }
      return Array.from(found);
    };

    const signals: BusinessSignals = {
      phones,
      emails,
      whatsappLinks,
      bookingLinks,
      socialLinks,
      googleMaps,
      ...(openingHours.length ? { openingHours } : {}),
      ...(serviceAreas.length ? { serviceAreas } : {}),
      ...(ratingValue !== undefined ? { ratingValue } : {}),
      ...(reviewCount !== undefined ? { reviewCount } : {}),
      hasReviews,
      hasTestimonials,
      awards: findKeywordSnippets(AWARD_KEYWORDS),
      certifications: findKeywordSnippets(CERT_KEYWORDS),
      accreditations: findKeywordSnippets(ACCREDITATION_KEYWORDS),
      guarantees: findKeywordSnippets(GUARANTEE_KEYWORDS)
    };

    console.log(
      `✅ Business signals: ${phones.length} phones, ${emails.length} emails, ` +
      `${socialLinks.length} socials, ${bookingLinks.length} booking links`
    );
    return signals;
  }

  private static findContactLink(extraction: RenderedExtraction): string | null {
    try {
      const base = new URL(extraction.finalUrl);
      const match = extraction.anchors.find((a) => {
        if (!a.href.startsWith('http')) return false;
        const url = new URL(a.href);
        return url.host === base.host && /\/contact\b/i.test(url.pathname);
      });
      return match ? match.href : null;
    } catch {
      return null;
    }
  }

  private static findLocalBusiness(blocks: unknown[]): any | null {
    const visit = (node: any): any | null => {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = visit(item);
          if (found) return found;
        }
        return null;
      }
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (types.some((t: any) => typeof t === 'string' && /localbusiness|organization|store|restaurant|dentist|plumber/i.test(t))) {
        return node;
      }
      if (node['@graph']) return visit(node['@graph']);
      return null;
    };

    for (const block of blocks) {
      const found = visit(block);
      if (found) return found;
    }
    return null;
  }

  private static extractOpeningHours(business: any): string[] {
    if (!business) return [];
    if (Array.isArray(business.openingHours)) {
      return business.openingHours.map((h: any) => String(h)).slice(0, 10);
    }
    if (typeof business.openingHours === 'string') {
      return [business.openingHours];
    }
    if (Array.isArray(business.openingHoursSpecification)) {
      return business.openingHoursSpecification.slice(0, 10).map((spec: any) => {
        const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek.join(', ') : spec.dayOfWeek || '';
        return `${days} ${spec.opens || ''}-${spec.closes || ''}`.trim();
      });
    }
    return [];
  }

  private static extractServiceAreas(business: any): string[] {
    if (!business || !business.areaServed) return [];
    const areas = Array.isArray(business.areaServed) ? business.areaServed : [business.areaServed];
    return areas
      .map((a: any) => (typeof a === 'string' ? a : a?.name || ''))
      .filter(Boolean)
      .slice(0, 10);
  }

  private static extractRating(business: any): { ratingValue?: number; reviewCount?: number } {
    const rating = business?.aggregateRating;
    if (!rating) return {};
    const ratingValue = parseFloat(rating.ratingValue);
    const reviewCount = parseInt(rating.reviewCount ?? rating.ratingCount, 10);
    return {
      ...(Number.isFinite(ratingValue) ? { ratingValue } : {}),
      ...(Number.isFinite(reviewCount) ? { reviewCount } : {})
    };
  }
}
