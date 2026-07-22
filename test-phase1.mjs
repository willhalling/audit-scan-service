// Phase 1 smoke test: exercises every new browser-based service against a
// real site without Firebase/OpenAI. Run: node test-phase1.mjs [url]
import fs from 'fs';
import { ScanSession } from './dist/services/scan-session.service.js';
import { RenderedExtractService } from './dist/services/rendered-extract.service.js';
import { MobileAnalysisService } from './dist/services/mobile-analysis.service.js';
import { AccessibilityService } from './dist/services/accessibility.service.js';
import { BusinessSignalsService } from './dist/services/business-signals.service.js';
import { ScreenshotService } from './dist/services/screenshot.service.js';
import { LighthouseService } from './dist/services/lighthouse.service.js';

const url = process.argv[2] || 'https://example.com';
console.log(`Smoke testing pipeline against ${url}`);

const session = await ScanSession.create(url);
console.log('✅ session created, finalUrl:', session.finalUrl);

const extraction = await RenderedExtractService.extract(session.mobilePage);
console.log('✅ extraction:', {
  title: extraction.title,
  headings: extraction.headings.length,
  anchors: extraction.anchors.length,
  images: extraction.imageCount,
  words: extraction.wordCount,
  fonts: extraction.fonts.slice(0, 3),
  colors: extraction.colorPalette.slice(0, 3)
});

const mobile = await MobileAnalysisService.analyse(session.mobilePage);
console.log('✅ mobile analysis:', {
  viewportConfigured: mobile.viewportConfigured,
  horizontalOverflow: mobile.horizontalOverflow,
  smallTapTargets: mobile.smallTapTargets.count,
  ctaAboveFold: mobile.ctaAboveFold,
  heroDetected: mobile.heroDetected,
  pageHeightViewports: mobile.pageHeightViewports
});

// Screenshot capture from live pages (upload skipped — no Firebase creds locally)
const mobileFold = await ScreenshotService.captureFromPage(session.mobilePage, false);
const desktopFold = await ScreenshotService.captureFromPage(session.desktopPage, false);
const mobileFull = await ScreenshotService.captureFromPage(session.mobilePage, true);
const desktopFull = await ScreenshotService.captureFromPage(session.desktopPage, true);
fs.writeFileSync('/tmp/smoke-mobile-fold.jpg', mobileFold);
fs.writeFileSync('/tmp/smoke-desktop-fold.jpg', desktopFold);
fs.writeFileSync('/tmp/smoke-mobile-full.jpg', mobileFull);
fs.writeFileSync('/tmp/smoke-desktop-full.jpg', desktopFull);
console.log('✅ screenshots captured:', {
  mobileFold: mobileFold.length,
  desktopFold: desktopFold.length,
  mobileFull: mobileFull.length,
  desktopFull: desktopFull.length
});

const accessibility = await AccessibilityService.analyse(session.mobilePage);
console.log('✅ accessibility:', {
  violationCount: accessibility.violationCount,
  sample: accessibility.violations.slice(0, 3).map((v) => v.id),
  missingAltCount: accessibility.missingAltCount,
  contrastIssueCount: accessibility.contrastIssueCount
});

const business = await BusinessSignalsService.collect(extraction, session.mobilePage);
console.log('✅ business signals:', {
  phones: business.phones.length,
  emails: business.emails.length,
  socials: business.socialLinks.length,
  hasReviews: business.hasReviews
});

await session.close();
console.log('✅ session closed');

const lhr = await LighthouseService.runLighthouse({ url, useDesktop: false });
const reduced = LighthouseService.reduce(lhr);
console.log('✅ lighthouse mobile reduced:', reduced);

console.log('\n🎉 Smoke test complete');
process.exit(0);
