import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Page } from 'puppeteer-core';
import { ScanPackage } from '../types/index.js';

type AccessibilityScan = ScanPackage['accessibility'];

const require = createRequire(import.meta.url);

/**
 * Run axe-core (WCAG 2.x A/AA) against the live mobile page and reduce the
 * result to the contract shape. No annotated screenshots.
 */
export class AccessibilityService {
  private static axeSource: string | null = null;

  private static loadAxeSource(): string {
    if (this.axeSource) return this.axeSource;

    const candidates = [
      // Resolved from the installed package (works regardless of cwd)
      require.resolve('axe-core/axe.min.js'),
      path.resolve(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          this.axeSource = fs.readFileSync(candidate, 'utf8');
          console.log(`📦 Loaded axe-core from ${candidate}`);
          return this.axeSource;
        }
      } catch {
        // try next candidate
      }
    }

    throw new Error('Could not locate axe-core/axe.min.js in node_modules');
  }

  static async analyse(page: Page): Promise<AccessibilityScan> {
    console.log('♿ Running axe accessibility scan...');

    const axeSource = this.loadAxeSource();
    await page.evaluate(axeSource);

    const raw: any = await page.evaluate(async () => {
      const axe = (window as any).axe;
      if (!axe) throw new Error('axe-core failed to initialise in the page');

      const results = await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
        },
        resultTypes: ['violations']
      });

      return {
        violations: results.violations.map((v: any) => ({
          id: v.id,
          impact: v.impact || 'minor',
          description: v.description || '',
          help: v.help || '',
          nodes: v.nodes.map((n: any) => ({
            target: Array.isArray(n.target) ? n.target.join(' ') : String(n.target),
            failureSummary: n.failureSummary || ''
          }))
        }))
      };
    });

    const violations = (raw.violations as any[]).slice(0, 25).map((v) => ({
      id: String(v.id).slice(0, 80),
      impact: String(v.impact),
      description: String(v.description).slice(0, 300),
      help: String(v.help).slice(0, 300),
      nodes: (v.nodes as { target: string }[])
        .slice(0, 5)
        .map((n) => n.target.slice(0, 200))
    }));

    // --- Derived counts ------------------------------------------------------
    const countNodes = (ids: string[]): number =>
      (raw.violations as any[])
        .filter((v) => ids.includes(v.id))
        .reduce((sum, v) => sum + v.nodes.length, 0);

    const missingAltCount = countNodes(['image-alt', 'input-image-alt', 'area-alt']);
    const missingFormLabelCount = countNodes(['label', 'form-field-multiple-labels', 'select-name', 'input-button-name']);
    const contrastIssueCount = countNodes(['color-contrast', 'color-contrast-enhanced']);
    const ariaIssueCount = (raw.violations as any[]).filter(
      (v) => String(v.id).startsWith('aria-') || String(v.id).includes('aria') || v.id === 'button-name' || v.id === 'link-name'
    ).length;

    const headingOrderIssues: string[] = [];
    (raw.violations as any[])
      .filter((v) => v.id === 'heading-order' || v.id === 'page-has-heading-one')
      .forEach((v) => {
        v.nodes.slice(0, 10).forEach((n: any) => {
          headingOrderIssues.push((n.failureSummary || v.help || '').replace(/\s+/g, ' ').slice(0, 200));
        });
      });

    // Keyboard proxies: positive tabindex, focusable non-interactive content,
    // scrollable regions without keyboard access.
    const keyboardIssueCount = countNodes([
      'tabindex',
      'focus-order-semantics',
      'scrollable-region-focusable',
      'nested-interactive',
      'frame-focusable-content'
    ]);

    console.log(
      `✅ Accessibility scan: ${raw.violations.length} violations (alt=${missingAltCount}, labels=${missingFormLabelCount}, contrast=${contrastIssueCount})`
    );

    return {
      violations,
      violationCount: raw.violations.length,
      missingAltCount,
      missingFormLabelCount,
      contrastIssueCount,
      headingOrderIssues,
      ariaIssueCount,
      keyboardIssueCount
    };
  }
}
