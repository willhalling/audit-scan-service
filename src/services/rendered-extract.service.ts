import { Page } from 'puppeteer-core';

export interface ExtractedForm {
  action?: string;
  fieldCount: number;
  hasLabels: boolean;
}

export interface ExtractedAnchor {
  href: string;
  text: string;
}

export interface RenderedExtraction {
  finalUrl: string;
  title: string;
  description: string;
  canonical: string;
  language: string;
  viewportMeta: string;
  robotsNoindex: boolean;
  faviconUrl: string;
  openGraph: Record<string, string>;
  headings: { level: number; text: string }[];
  /** All anchors on the page (href + text) — capped; used to derive link lists and business signals. */
  anchors: ExtractedAnchor[];
  buttons: string[];
  ctas: string[];
  forms: ExtractedForm[];
  images: { src: string; alt?: string }[];
  imageCount: number;
  imagesMissingAlt: number;
  structuredData: unknown[];
  fonts: string[];
  colorPalette: string[];
  bodyText: string;
  wordCount: number;
  /** Untruncated-ish visible text for keyword/regex scans. NOT stored in Firestore. */
  fullText: string;
}

const CTA_KEYWORDS = [
  'call', 'book', 'contact', 'quote', 'get in touch', 'enquire', 'enquiry',
  'request', 'schedule', 'appointment', 'free', 'get started', 'buy', 'order',
  'email', 'phone', 'message', 'whatsapp', 'reserve'
];

/**
 * Extract rendered page data from a live page (mobile context) via a single
 * page.evaluate pass. Raw HTML is intentionally not kept; only trimmed,
 * structured data leaves the page.
 */
export class RenderedExtractService {
  static async extract(page: Page, ctaKeywords: string[] = CTA_KEYWORDS): Promise<RenderedExtraction> {
    console.log('🔬 Extracting rendered page data...');

    const result = await page.evaluate((ctaWords: string[]) => {
      const text = (el: Element | null): string =>
        (el?.textContent || '').replace(/\s+/g, ' ').trim();

      const abs = (href: string | null | undefined): string => {
        if (!href) return '';
        try {
          return new URL(href, document.baseURI).href;
        } catch {
          return href;
        }
      };

      // --- Meta ---------------------------------------------------------------
      const metaContent = (selector: string): string =>
        (document.querySelector(selector)?.getAttribute('content') || '').trim();

      const openGraph: Record<string, string> = {};
      document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
        const property = el.getAttribute('property');
        const content = el.getAttribute('content');
        if (property && content) openGraph[property.replace(/^og:/, '')] = content.slice(0, 300);
      });

      const robots = metaContent('meta[name="robots"]').toLowerCase();

      let faviconUrl = '';
      const iconLink = document.querySelector(
        'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
      );
      if (iconLink) faviconUrl = abs(iconLink.getAttribute('href'));
      if (!faviconUrl) {
        try {
          faviconUrl = new URL('/favicon.ico', document.baseURI).href;
        } catch {
          faviconUrl = '';
        }
      }

      // --- Headings -------------------------------------------------------------
      const headings: { level: number; text: string }[] = [];
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
        if (headings.length >= 60) return;
        const t = text(el);
        if (t) headings.push({ level: parseInt(el.tagName.substring(1), 10), text: t.slice(0, 200) });
      });

      // --- Anchors / buttons / CTAs --------------------------------------------
      const anchors: { href: string; text: string }[] = [];
      document.querySelectorAll('a[href]').forEach((el) => {
        if (anchors.length >= 500) return;
        const href = el.getAttribute('href') || '';
        if (!href || href.startsWith('javascript:') || href === '#') return;
        anchors.push({ href: abs(href), text: text(el).slice(0, 120) });
      });

      const buttons: string[] = [];
      document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach((el) => {
        if (buttons.length >= 50) return;
        const label = text(el) || (el.getAttribute('value') || '').trim() || (el.getAttribute('aria-label') || '').trim();
        if (label) buttons.push(label.slice(0, 120));
      });

      const ctaCandidates = new Set<string>();
      const maybeCta = (label: string) => {
        const lower = label.toLowerCase();
        return label.length > 1 && label.length < 60 && ctaWords.some((w) => lower.includes(w));
      };
      anchors.forEach((a) => {
        if (ctaCandidates.size >= 50) return;
        if (maybeCta(a.text)) ctaCandidates.add(a.text);
      });
      buttons.forEach((b) => {
        if (ctaCandidates.size >= 50) return;
        if (maybeCta(b)) ctaCandidates.add(b);
      });

      // --- Forms ------------------------------------------------------------------
      const forms: { action?: string; fieldCount: number; hasLabels: boolean }[] = [];
      document.querySelectorAll('form').forEach((form) => {
        if (forms.length >= 20) return;
        const fields = Array.from(
          form.querySelectorAll('input, select, textarea')
        ).filter((f) => {
          const type = (f.getAttribute('type') || '').toLowerCase();
          return type !== 'hidden' && type !== 'submit' && type !== 'button';
        });
        const hasLabels = fields.every((f) => {
          const id = f.getAttribute('id');
          const hasExplicitLabel = !!id && !!form.querySelector(`label[for="${CSS.escape(id)}"]`);
          const wrapped = !!f.closest('label');
          const ariaLabel = f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('placeholder');
          return hasExplicitLabel || wrapped || !!ariaLabel;
        });
        const action = form.getAttribute('action');
        forms.push({
          ...(action ? { action: abs(action) } : {}),
          fieldCount: fields.length,
          hasLabels
        });
      });

      // --- Images -------------------------------------------------------------------
      const images: { src: string; alt?: string }[] = [];
      let imagesMissingAlt = 0;
      const allImages = Array.from(document.querySelectorAll('img'));
      allImages.forEach((img) => {
        const altAttr = img.getAttribute('alt');
        const alt = altAttr === null ? undefined : altAttr.trim();
        if (!alt) imagesMissingAlt++;
        if (images.length < 50) {
          const src = abs(img.getAttribute('src') || img.getAttribute('data-src'));
          if (src) images.push(alt ? { src, alt: alt.slice(0, 200) } : { src });
        }
      });

      // --- Structured data -----------------------------------------------------------
      const structuredData: unknown[] = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        if (structuredData.length >= 10) return;
        try {
          const parsed = JSON.parse(script.textContent || '');
          structuredData.push(parsed);
        } catch {
          // ignore malformed JSON-LD
        }
      });

      // --- Fonts + colours --------------------------------------------------------------
      const fonts = new Set<string>();
      document.querySelectorAll('body, h1, h2, h3, p, a, button, li, span').forEach((el) => {
        if (fonts.size >= 12) return;
        const family = window.getComputedStyle(el).fontFamily;
        if (family) family.split(',').forEach((f) => fonts.add(f.trim().replace(/["']/g, '')));
      });

      const colors = new Set<string>();
      const sample = (els: NodeListOf<Element>, prop: 'color' | 'backgroundColor') => {
        els.forEach((el) => {
          if (colors.size >= 12) return;
          const value = window.getComputedStyle(el)[prop];
          if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') colors.add(value);
        });
      };
      sample(document.querySelectorAll('h1, h2, h3, p, a, li'), 'color');
      sample(document.querySelectorAll('header, footer, section, button, nav, body'), 'backgroundColor');

      // --- Text ---------------------------------------------------------------------
      const clone = document.body ? (document.body.cloneNode(true) as HTMLElement) : null;
      clone?.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove());
      const fullText = ((clone?.innerText || '') as string).replace(/\s+/g, ' ').trim();
      const words = fullText.split(' ').filter((w) => w.length > 0);

      return {
        finalUrl: window.location.href,
        title: (document.title || '').trim(),
        description: metaContent('meta[name="description"]'),
        canonical: abs(document.querySelector('link[rel="canonical"]')?.getAttribute('href')),
        language: (document.documentElement.getAttribute('lang') || '').trim(),
        viewportMeta: metaContent('meta[name="viewport"]'),
        robotsNoindex: robots.includes('noindex'),
        faviconUrl,
        openGraph,
        headings,
        anchors,
        buttons,
        ctas: Array.from(ctaCandidates),
        forms,
        images,
        imageCount: allImages.length,
        imagesMissingAlt,
        structuredData,
        fonts: Array.from(fonts).slice(0, 10),
        colorPalette: Array.from(colors).slice(0, 10),
        bodyText: fullText.slice(0, 3000),
        wordCount: words.length,
        fullText: fullText.slice(0, 20000)
      };
    }, ctaKeywords);

    console.log(`✅ Extraction complete: ${result.headings.length} headings, ${result.anchors.length} links, ${result.imageCount} images, ${result.wordCount} words`);
    return result as RenderedExtraction;
  }
}
