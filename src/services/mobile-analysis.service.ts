import { Page } from 'puppeteer-core';
import { ScanPackage } from '../types/index.js';

type MobileAnalysis = ScanPackage['mobile'];

const TRUST_KEYWORDS = [
  'review', 'reviews', 'rated', 'rating', 'stars', 'testimonial',
  'guarantee', 'guaranteed', 'warranty', 'certified', 'accredited',
  'licensed', 'insured', 'trusted', 'years of experience', 'years experience',
  'award', 'family run', 'family owned', 'checkatrade', 'trustpilot',
  'google rating', 'which? trusted', 'free quote', 'no obligation'
];

const CTA_WORDS = [
  'call', 'book', 'contact', 'quote', 'get in touch', 'enquire', 'request',
  'schedule', 'appointment', 'get started', 'message', 'whatsapp', 'email us'
];

/**
 * Mobile-experience heuristics computed inside the emulated mobile context
 * (390x844). Everything runs in one page.evaluate pass.
 */
export class MobileAnalysisService {
  static async analyse(page: Page): Promise<MobileAnalysis> {
    console.log('📱 Running mobile-experience analysis...');

    const result = await page.evaluate(
      (trustKeywords: string[], ctaWords: string[]) => {
        const foldHeight = window.innerHeight;
        const foldWidth = window.innerWidth;

        const isVisible = (el: Element): boolean => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        const labelOf = (el: Element): string => {
          const raw =
            (el.textContent || '').trim() ||
            el.getAttribute('aria-label') ||
            el.getAttribute('href') ||
            el.tagName;
          return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
        };

        // --- Viewport meta -----------------------------------------------------
        const viewportMeta = (
          document.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''
        ).trim();
        const viewportConfigured =
          /width\s*=\s*device-width/.test(viewportMeta) && !/user-scalable\s*=\s*no/.test(viewportMeta);

        // --- Horizontal overflow --------------------------------------------------
        const horizontalOverflow =
          document.documentElement.scrollWidth > foldWidth + 1 ||
          document.body.scrollWidth > foldWidth + 1;

        // --- Tap targets -------------------------------------------------------------
        const smallTap: string[] = [];
        let smallTapCount = 0;
        document
          .querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"], select')
          .forEach((el) => {
            if (!isVisible(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width < 44 || rect.height < 44) {
              smallTapCount++;
              if (smallTap.length < 10) smallTap.push(labelOf(el));
            }
          });

        // --- Font sizes ----------------------------------------------------------------
        const smallFonts: string[] = [];
        let smallFontCount = 0;
        document.querySelectorAll('p, li, span, td, div, a').forEach((el) => {
          if (smallFontCount >= 200) return;
          if (!isVisible(el)) return;
          // Only consider elements with their own direct text
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent || '').trim())
            .join(' ');
          if (ownText.length < 20) return;
          const size = parseFloat(window.getComputedStyle(el).fontSize);
          if (size > 0 && size < 14) {
            smallFontCount++;
            if (smallFonts.length < 10) {
              smallFonts.push(`${ownText.slice(0, 50)} (${Math.round(size * 10) / 10}px)`);
            }
          }
        });

        // --- Sticky / fixed elements -------------------------------------------------------
        const sticky: string[] = [];
        let stickyCount = 0;
        document.querySelectorAll('body *').forEach((el) => {
          const position = window.getComputedStyle(el).position;
          if (position === 'fixed' || position === 'sticky') {
            if (!isVisible(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 20) return;
            stickyCount++;
            if (sticky.length < 10) {
              const id = el.id ? `#${el.id}` : '';
              const cls = (el.getAttribute('class') || '').split(' ').filter(Boolean).slice(0, 2).join('.');
              sticky.push(`${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''} (${position})`);
            }
          }
        });

        // --- CTA above the fold ------------------------------------------------------------
        const ctaTexts: string[] = [];
        document
          .querySelectorAll('a, button, [role="button"], input[type="submit"]')
          .forEach((el) => {
            if (ctaTexts.length >= 10) return;
            if (!isVisible(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.top >= foldHeight || rect.bottom < 0) return;
            const label = labelOf(el);
            const lower = label.toLowerCase();
            if (label.length > 1 && label.length < 60 && ctaWords.some((w) => lower.includes(w))) {
              if (!ctaTexts.includes(label)) ctaTexts.push(label);
            }
          });

        // --- Hero detection -------------------------------------------------------------------
        let heroDetected = false;
        let heroText = '';
        const heroSelectors = ['[class*="hero"]', '[id*="hero"]', 'header', 'main > section:first-of-type', 'body > section:first-of-type'];
        for (const selector of heroSelectors) {
          const el = document.querySelector(selector);
          if (!el || !isVisible(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.top < foldHeight && rect.height > foldHeight * 0.25) {
            heroDetected = true;
            const heading = el.querySelector('h1, h2');
            heroText = ((heading?.textContent || el.textContent || '') as string)
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 200);
            break;
          }
        }
        if (!heroDetected) {
          const h1 = document.querySelector('h1');
          if (h1 && isVisible(h1)) {
            const rect = h1.getBoundingClientRect();
            if (rect.top < foldHeight && rect.height > 0) {
              heroDetected = true;
              heroText = (h1.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            }
          }
        }

        // --- Trust signals + contact info in the first viewport ---------------------------------
        const foldTextParts: string[] = [];
        document.querySelectorAll('body *').forEach((el) => {
          if (foldTextParts.join(' ').length > 20000) return;
          const rect = el.getBoundingClientRect();
          if (rect.top >= foldHeight || rect.bottom < 0) return;
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent || '').trim())
            .join(' ');
          if (ownText) foldTextParts.push(ownText);
        });
        const foldText = foldTextParts.join(' ').toLowerCase();

        const trustSignals = trustKeywords.filter((k) => foldText.includes(k));

        let phoneAboveFold = false;
        let emailAboveFold = false;
        document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.top >= foldHeight || rect.bottom < 0) return;
          if ((el.getAttribute('href') || '').startsWith('tel:')) phoneAboveFold = true;
          if ((el.getAttribute('href') || '').startsWith('mailto:')) emailAboveFold = true;
        });
        if (!phoneAboveFold && /(\+?\d[\d\s().-]{8,}\d)/.test(foldText)) phoneAboveFold = true;
        if (!emailAboveFold && /[\w.+-]+@[\w-]+\.[\w.]+/.test(foldText)) emailAboveFold = true;

        // --- Page height + lazy loading ---------------------------------------------------------
        const pageHeightViewports =
          Math.round((document.documentElement.scrollHeight / foldHeight) * 10) / 10;
        const lazyLoadedImages = document.querySelectorAll(
          'img[loading="lazy"], img[data-src], img[data-lazy-src]'
        ).length;

        return {
          viewportMeta,
          viewportConfigured,
          horizontalOverflow,
          smallTapTargets: { count: smallTapCount, examples: smallTap },
          smallFontSizes: { count: smallFontCount, examples: smallFonts },
          stickyElements: { count: stickyCount, examples: sticky },
          ctaAboveFold: ctaTexts.length > 0,
          ctaTexts,
          heroDetected,
          heroText,
          trustSignalsAboveFold: trustSignals,
          contactInfoAboveFold: { phone: phoneAboveFold, email: emailAboveFold },
          pageHeightViewports,
          lazyLoadedImages
        };
      },
      TRUST_KEYWORDS,
      CTA_WORDS
    );

    console.log(
      `✅ Mobile analysis: overflow=${result.horizontalOverflow}, smallTapTargets=${result.smallTapTargets.count}, ctaAboveFold=${result.ctaAboveFold}`
    );
    return result as MobileAnalysis;
  }
}
