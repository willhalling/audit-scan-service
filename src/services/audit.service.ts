import type { AuditRequest, PageData, ScanPackage, AuditScreenshots, ReducedLighthouseData } from '../types/index.js';
import { firebaseService } from './firebase.service.js';
import { ScanSession, DESKTOP_VIEWPORT } from './scan-session.service.js';
import { ScreenshotService } from './screenshot.service.js';
import { RenderedExtractService, RenderedExtraction } from './rendered-extract.service.js';
import { MobileAnalysisService } from './mobile-analysis.service.js';
import { AccessibilityService } from './accessibility.service.js';
import { BusinessSignalsService } from './business-signals.service.js';
import { AiAuditService } from './ai-audit.service.js';

export class AuditService {

  static async startAudit(request: AuditRequest & { auditId: string }): Promise<{ auditId: string; error?: string }> {

    const auditId = request.auditId;

    // Create audit record in Firebase with authorUid if provided
    await firebaseService.createAudit(auditId, request.url, request.authorUid);

    // Run the audit inline — the RunPod caller polls Firestore for progress,
    // so statuses + partial results are written after each step.
    await this.runAudit(auditId, request).catch(async (error) => {
      console.error(`❌ Audit ${auditId} failed:`, error);
      await firebaseService.updateAuditError(auditId, error.message);
    });

    return { auditId };
  }

  private static async runAudit(auditId: string, request: AuditRequest): Promise<void> {
    const url = request.url.replace(/\/$/, '');
    const host = new URL(url).hostname.replace(/^www\./, '');
    const enableAI = request.enableAI !== false;

    let session: ScanSession | null = null;
    const screenshots: AuditScreenshots = {};
    let extraction: RenderedExtraction | null = null;
    let mobilePerf: ReducedLighthouseData | null = null;
    let desktopPerf: ReducedLighthouseData | null = null;

    try {
      console.log(`🔍 Starting audit for ${auditId}: ${url}`);

      // 1. Shared browser session + rendered extraction + mobile analysis
      await firebaseService.updateAuditStatus(auditId, 'analysing');
      session = await ScanSession.create(url);

      extraction = await RenderedExtractService.extract(session.mobilePage);
      const mobileAnalysis = await MobileAnalysisService.analyse(session.mobilePage);

      const { internalLinks, externalLinks } = this.splitLinks(extraction);
      const structuredDataTypes = this.getStructuredDataTypes(extraction.structuredData);

      const pageData: PageData = {
        url: extraction.finalUrl,
        pagePath: '/',
        meta: {
          title: extraction.title,
          description: extraction.description,
          language: extraction.language || 'en',
          ...(extraction.viewportMeta ? { viewport: extraction.viewportMeta } : {}),
          canonical: extraction.canonical
        },
        screenshots: {}
      };

      await firebaseService.updateAuditScan(auditId, {
        website: {
          url,
          host,
          finalUrl: extraction.finalUrl,
          ...(extraction.title ? { title: extraction.title } : {}),
          ...(extraction.description ? { description: extraction.description } : {}),
          ...(extraction.canonical ? { canonical: extraction.canonical } : {}),
          ...(extraction.faviconUrl ? { faviconUrl: extraction.faviconUrl } : {}),
          ...(extraction.language ? { language: extraction.language } : {})
        },
        pages: [extraction.finalUrl],
        seo: {
          ...(extraction.title ? { title: extraction.title } : {}),
          ...(extraction.description ? { description: extraction.description } : {}),
          ...(extraction.canonical ? { canonical: extraction.canonical } : {}),
          openGraph: extraction.openGraph,
          robotsNoindex: extraction.robotsNoindex,
          structuredDataTypes,
          hasSingleH1: extraction.headings.filter((h) => h.level === 1).length === 1
        },
        mobile: mobileAnalysis,
        desktop: {
          viewportWidth: DESKTOP_VIEWPORT.width,
          viewportHeight: DESKTOP_VIEWPORT.height
        },
        extractedContent: {
          headings: extraction.headings,
          ctas: extraction.ctas,
          buttons: extraction.buttons,
          forms: extraction.forms,
          internalLinkCount: internalLinks.count,
          externalLinkCount: externalLinks.count,
          internalLinks: internalLinks.sample,
          externalLinks: externalLinks.sample,
          imageCount: extraction.imageCount,
          imagesMissingAlt: extraction.imagesMissingAlt,
          images: extraction.images,
          bodyText: extraction.bodyText,
          wordCount: extraction.wordCount,
          fonts: extraction.fonts,
          colorPalette: extraction.colorPalette
        },
        structuredData: extraction.structuredData
      });
      console.log('💾 Scan metadata written');

      // 2. Screenshots — above-fold first, written immediately, then full-page
      await firebaseService.updateAuditStatus(auditId, 'screenshots');

      const foldShots = await ScreenshotService.captureFoldScreenshots(session, auditId, host);
      Object.assign(screenshots, foldShots);
      pageData.screenshots = {
        ...foldShots,
        // Backward-compat fields point at the fold shots
        ...(foldShots.mobileFoldUrl ? { mobileUrl: foldShots.mobileFoldUrl } : {}),
        ...(foldShots.desktopFoldUrl ? { desktopUrl: foldShots.desktopFoldUrl } : {})
      };
      await firebaseService.updateAuditScan(auditId, { screenshots: { ...screenshots } });
      await firebaseService.updateAuditPages(auditId, [pageData]);
      console.log('📸 Above-fold screenshots written');

      const fullShots = await ScreenshotService.captureFullScreenshots(session, auditId, host);
      Object.assign(screenshots, fullShots);
      pageData.screenshots = { ...pageData.screenshots, ...fullShots };
      await firebaseService.updateAuditScan(auditId, { screenshots: { ...screenshots } });
      await firebaseService.updateAuditPages(auditId, [pageData]);
      console.log('📸 Full-page screenshots written');

      // 3. Performance — mobile Lighthouse primary, desktop secondary
      await firebaseService.updateAuditStatus(auditId, 'performance');
      const LighthouseService = (await import('./lighthouse.service.js')).LighthouseService;

      try {
        mobilePerf = LighthouseService.reduce(await LighthouseService.runLighthouse({ url, useDesktop: false }));
        console.log(`✅ Lighthouse mobile complete (score: ${mobilePerf.performanceScore})`);
      } catch (error) {
        console.warn(`⚠️ Lighthouse mobile failed for ${url}:`, error);
      }

      try {
        desktopPerf = LighthouseService.reduce(await LighthouseService.runLighthouse({ url, useDesktop: true }));
        console.log(`✅ Lighthouse desktop complete (score: ${desktopPerf.performanceScore})`);
      } catch (error) {
        console.warn(`⚠️ Lighthouse desktop failed for ${url}:`, error);
      }

      if (mobilePerf || desktopPerf) {
        if (mobilePerf) pageData.lighthouseMobile = mobilePerf;
        if (desktopPerf) pageData.lighthouseDesktop = desktopPerf;
        await firebaseService.updateAuditScan(auditId, {
          performance: {
            ...(mobilePerf ? { mobile: mobilePerf } : {}),
            ...(desktopPerf ? { desktop: desktopPerf } : {})
          }
        });
        await firebaseService.updateAuditPages(auditId, [pageData]);
      }

      // 4. Accessibility — axe-core on the live mobile page
      await firebaseService.updateAuditStatus(auditId, 'accessibility');
      try {
        const accessibility = await AccessibilityService.analyse(session.mobilePage);
        await firebaseService.updateAuditScan(auditId, { accessibility });
      } catch (error) {
        console.warn(`⚠️ Accessibility scan failed for ${url}:`, error);
        await firebaseService.updateAuditScan(auditId, {
          accessibility: this.emptyAccessibility()
        });
      }

      // 5. Business signals (may navigate the mobile page to /contact — done last)
      await firebaseService.updateAuditStatus(auditId, 'business');
      try {
        const business = await BusinessSignalsService.collect(extraction, session.mobilePage);
        await firebaseService.updateAuditScan(auditId, { business });
      } catch (error) {
        console.warn(`⚠️ Business signal collection failed for ${url}:`, error);
      }

      // Close the browser before the (external) AI step
      await session.close();
      session = null;

      // 6. AI consultant report (optional, non-fatal)
      if (enableAI) {
        await firebaseService.updateAuditStatus(auditId, 'ai');
        try {
          const scan = (await firebaseService.getAudit(auditId))?.scan as ScanPackage | undefined;
          if (!scan) throw new Error('Scan package missing from Firestore');
          const aiReport = await AiAuditService.generate(scan, screenshots);
          await firebaseService.updateAuditAiReport(auditId, aiReport);
        } catch (error) {
          console.warn(`⚠️ AI report generation failed for ${url} (audit continues without it):`, error);
        }
      } else {
        console.log('⏭️ AI report skipped (enableAI=false)');
      }

      // 7. Done
      await firebaseService.updateAuditStatus(auditId, 'completed');
      console.log(`✅ Audit ${auditId} completed successfully`);

    } catch (error) {
      console.error(`❌ Error during audit ${auditId}:`, error);
      throw error;
    } finally {
      if (session) {
        try {
          await session.close();
        } catch (closeError) {
          console.warn('⚠️ Failed to close scan session:', closeError);
        }
      }
    }
  }

  private static splitLinks(extraction: RenderedExtraction): {
    internalLinks: { count: number; sample: string[] };
    externalLinks: { count: number; sample: string[] };
  } {
    let baseHost = '';
    try {
      baseHost = new URL(extraction.finalUrl).hostname.replace(/^www\./, '');
    } catch {
      // ignore
    }

    const internal = new Set<string>();
    const external = new Set<string>();
    for (const anchor of extraction.anchors) {
      if (!anchor.href.startsWith('http')) continue;
      try {
        const linkHost = new URL(anchor.href).hostname.replace(/^www\./, '');
        if (linkHost === baseHost) {
          internal.add(anchor.href);
        } else {
          external.add(anchor.href);
        }
      } catch {
        // ignore malformed URLs
      }
    }

    return {
      internalLinks: { count: internal.size, sample: Array.from(internal).slice(0, 50) },
      externalLinks: { count: external.size, sample: Array.from(external).slice(0, 50) }
    };
  }

  private static getStructuredDataTypes(blocks: unknown[]): string[] {
    const types = new Set<string>();
    const visit = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      const nodeTypes = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      nodeTypes.forEach((t: any) => {
        if (typeof t === 'string') types.add(t);
      });
      if (node['@graph']) visit(node['@graph']);
    };
    blocks.forEach(visit);
    return Array.from(types).slice(0, 20);
  }

  private static emptyAccessibility(): ScanPackage['accessibility'] {
    return {
      violations: [],
      violationCount: 0,
      missingAltCount: 0,
      missingFormLabelCount: 0,
      contrastIssueCount: 0,
      headingOrderIssues: [],
      ariaIssueCount: 0,
      keyboardIssueCount: 0
    };
  }

  static async getAuditStatus(auditId: string) {
    return await firebaseService.getAudit(auditId);
  }
}
