import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { StorageService } from './storage.service.js';
import { PuppeteerConfig } from '../utils/puppeteer-config.js';
export class AccessibilityService {
    static async runAccessibilityAudit(url, auditId, host) {
        console.log(`♿ Running accessibility audit for ${url}`);
        console.log(`♿ Running desktop accessibility audit...`);
        const desktopResult = await this.runSingleAccessibilityAudit(url, auditId, host, 'desktop');
        console.log(`♿ Running mobile accessibility audit...`);
        const mobileResult = await this.runSingleAccessibilityAudit(url, auditId, host, 'mobile');
        const allViolations = [...desktopResult.violations, ...mobileResult.violations];
        const uniqueViolations = allViolations.filter((violation, index, self) => index === self.findIndex(v => v.id === violation.id));
        const summary = {
            score: Math.max(0, 100 - (uniqueViolations.length * 5)),
            totalViolations: uniqueViolations.length,
            passCount: 0,
            criticalCount: uniqueViolations.filter(v => v.impact === 'critical').length,
            seriousCount: uniqueViolations.filter(v => v.impact === 'serious').length,
            moderateCount: uniqueViolations.filter(v => v.impact === 'moderate').length,
            minorCount: uniqueViolations.filter(v => v.impact === 'minor').length
        };
        const accessibility = {
            summary,
            violations: uniqueViolations
        };
        const result = { accessibility };
        if (desktopResult.annotatedScreenshotUrl) {
            result.annotatedDesktopUrl = desktopResult.annotatedScreenshotUrl;
        }
        if (mobileResult.annotatedScreenshotUrl) {
            result.annotatedMobileUrl = mobileResult.annotatedScreenshotUrl;
        }
        return result;
    }
    static async runSingleAccessibilityAudit(url, auditId, host, viewport) {
        let lastError = null;
        const maxRetries = 2;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            let browser = null;
            try {
                console.log(`♿ Accessibility ${viewport} audit attempt ${attempt}/${maxRetries} for ${url}`);
                browser = await puppeteer.launch(await PuppeteerConfig.getLaunchOptions());
                const page = await browser.newPage();
                const viewportConfig = viewport === 'mobile'
                    ? this.DIMENSIONS.MOBILE
                    : this.DIMENSIONS.DESKTOP;
                await page.setViewport(viewportConfig);
                console.log(`♿ Set ${viewport} viewport: ${viewportConfig.width}x${viewportConfig.height}`);
                await page.goto(url, {
                    waitUntil: 'networkidle2',
                    timeout: 60000
                });
                await page.evaluate(() => {
                    const el = document.querySelector('#CybotCookiebotDialog');
                    if (el) {
                        el.style.display = 'none';
                    }
                });
                try {
                    await page.addScriptTag({
                        url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
                    });
                }
                catch (scriptError) {
                    console.warn('Failed to load axe-core from CDN, trying fallback...');
                    await page.addScriptTag({
                        url: 'https://unpkg.com/axe-core@4.8.2/axe.min.js'
                    });
                }
                const axeResults = await Promise.race([
                    page.evaluate(() => {
                        return new Promise((resolve) => {
                            window.axe.run((err, results) => {
                                if (err) {
                                    resolve({ violations: [], passes: [] });
                                }
                                else {
                                    resolve(results);
                                }
                            });
                        });
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Axe evaluation timeout')), 30000))
                ]);
                const violations = axeResults.violations || [];
                console.log(`♿ Found ${violations.length} ${viewport} violations`);
                let annotatedScreenshotUrl;
                try {
                    const elementCoordinates = await this.getElementCoordinates(page, violations);
                    const screenshot = await page.screenshot({
                        fullPage: false,
                        type: 'png'
                    });
                    const annotatedScreenshot = await this.annotateScreenshot(screenshot, violations, elementCoordinates);
                    const screenshotType = viewport === 'mobile' ? 'annotated-mobile' : 'annotated-desktop';
                    annotatedScreenshotUrl = await StorageService.uploadScreenshot(annotatedScreenshot, auditId, screenshotType, host);
                    console.log(`✅ ${viewport} annotated screenshot uploaded: ${annotatedScreenshotUrl}`);
                }
                catch (screenshotError) {
                    console.warn(`⚠️ Screenshot failed for ${viewport}:`, screenshotError);
                }
                const formattedViolations = violations.map((v) => ({
                    id: v.id,
                    impact: v.impact,
                    description: v.description,
                    help: v.help,
                    helpUrl: v.helpUrl,
                    nodes: v.nodes?.slice(0, 3).map((node) => ({
                        html: node.html?.substring(0, 200),
                        target: node.target,
                        failureSummary: node.failureSummary
                    })) || []
                }));
                await browser.close();
                const result = {
                    violations: formattedViolations
                };
                if (annotatedScreenshotUrl) {
                    result.annotatedScreenshotUrl = annotatedScreenshotUrl;
                }
                return result;
            }
            catch (error) {
                console.error(`❌ Accessibility ${viewport} audit attempt ${attempt} failed:`, error);
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (browser) {
                    try {
                        await browser.close();
                    }
                    catch (closeError) {
                        console.warn('Failed to close browser:', closeError);
                    }
                }
                if (attempt === maxRetries) {
                    throw lastError;
                }
                const waitTime = error instanceof Error && error.message.includes('Session closed') ? 5000 : 2000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        throw lastError || new Error('All accessibility audit attempts failed');
    }
    static async getElementCoordinates(page, violations) {
        console.log('📍 Getting element coordinates for', violations.length, 'violations');
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
        await new Promise(res => setTimeout(res, 500));
        const visualViolations = violations.filter((violation) => {
            const skipIds = [
                'document-title', 'html-has-lang', 'meta-viewport',
                'landmark-one-main', 'region', 'page-has-heading-one'
            ];
            return !skipIds.includes(violation.id);
        });
        console.log('📍 Visual violations to process:', visualViolations.length);
        const elementCoordinates = await page.evaluate((violations) => {
            const coords = [];
            violations.forEach((violation) => {
                violation.nodes.forEach((node) => {
                    try {
                        const selectors = Array.isArray(node.target) ? node.target : [node.target];
                        selectors.forEach((selector) => {
                            if (typeof selector === 'string') {
                                try {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach((element) => {
                                        const rect = element.getBoundingClientRect();
                                        if (rect.width > 0 && rect.height > 0) {
                                            coords.push({
                                                x: rect.left + rect.width / 2,
                                                y: rect.top + rect.height / 2,
                                                width: rect.width,
                                                height: rect.height,
                                                impact: violation.impact
                                            });
                                        }
                                    });
                                }
                                catch (selectorError) {
                                    console.warn('Invalid selector:', selector);
                                }
                            }
                        });
                    }
                    catch (error) {
                        console.warn('Error getting coordinates for node');
                    }
                });
            });
            return coords;
        }, visualViolations);
        console.log('📍 Got coordinates for', elementCoordinates.length, 'elements');
        return elementCoordinates;
    }
    static async annotateScreenshot(screenshot, violations, elementCoordinates) {
        try {
            console.log('📸 Annotating screenshot with', elementCoordinates.length, 'coordinates');
            if (elementCoordinates.length === 0) {
                console.log('📸 No coordinates to annotate');
                return screenshot;
            }
            const image = sharp(screenshot);
            const { width, height } = await image.metadata();
            if (!width || !height) {
                throw new Error('Could not get image dimensions');
            }
            const annotations = [];
            elementCoordinates.forEach((coord, index) => {
                const x = Math.max(25, Math.min(width - 25, coord.x));
                const y = Math.max(25, Math.min(height - 25, coord.y));
                const color = this.getImpactColor(coord.impact);
                annotations.push(`
          <circle cx="${x}" cy="${y}" r="15" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>
          <text x="${x}" y="${y + 4}" text-anchor="middle" fill="white" font-size="12" font-weight="bold" style="font-family: 'Inter', 'Arial', sans-serif;">${index + 1}</text>
        `);
            });
            const isMobile = width <= 400;
            const legendHeight = isMobile ? 80 : 100;
            const legendY = height - legendHeight - 10;
            const legendFont = "font-family: 'Inter', 'Arial', sans-serif;";
            if (isMobile) {
                annotations.push(`
          <rect x="10" y="${legendY}" width="${width - 20}" height="${legendHeight}" fill="rgba(0,0,0,0.8)" rx="5"/>
          <text x="20" y="${legendY + 22}" fill="white" font-size="12" font-weight="bold" style="${legendFont}">Accessibility Issues</text>
          <circle cx="30" cy="${legendY + 40}" r="6" fill="#dc2626"/>
          <text x="45" y="${legendY + 44}" fill="white" font-size="10" style="${legendFont}">Critical</text>
          <circle cx="110" cy="${legendY + 40}" r="6" fill="#ea580c"/>
          <text x="125" y="${legendY + 44}" fill="white" font-size="10" style="${legendFont}">Serious</text>
          <circle cx="30" cy="${legendY + 60}" r="6" fill="#d97706"/>
          <text x="45" y="${legendY + 64}" fill="white" font-size="10" style="${legendFont}">Moderate</text>
          <circle cx="110" cy="${legendY + 60}" r="6" fill="#65a30d"/>
          <text x="125" y="${legendY + 64}" fill="white" font-size="10" style="${legendFont}">Minor</text>
          <text x="20" y="${legendY + legendHeight - 10}" fill="white" font-size="9" style="${legendFont}">Numbers indicate issue locations</text>
        `);
            }
            else {
                annotations.push(`
          <rect x="10" y="${legendY}" width="${width - 20}" height="${legendHeight}" fill="rgba(0,0,0,0.8)" rx="5"/>
          <text x="20" y="${legendY + 25}" fill="white" font-size="14" font-weight="bold" style="${legendFont}">Accessibility Issues</text>
          <circle cx="30" cy="${legendY + 45}" r="8" fill="#dc2626"/>
          <text x="50" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Critical</text>
          <circle cx="120" cy="${legendY + 45}" r="8" fill="#ea580c"/>
          <text x="140" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Serious</text>
          <circle cx="210" cy="${legendY + 45}" r="8" fill="#d97706"/>
          <text x="230" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Moderate</text>
          <circle cx="300" cy="${legendY + 45}" r="8" fill="#65a30d"/>
          <text x="320" y="${legendY + 50}" fill="white" font-size="12" style="${legendFont}">Minor</text>
          <text x="20" y="${legendY + 80}" fill="white" font-size="10" style="${legendFont}">Numbers indicate issue locations</text>
        `);
            }
            const svgOverlay = `
        <svg width="${width}" height="${height}">
          ${annotations.join('')}
        </svg>
      `;
            const annotatedImage = await image
                .composite([{
                    input: Buffer.from(svgOverlay),
                    top: 0,
                    left: 0,
                }])
                .png()
                .toBuffer();
            console.log('📸 Screenshot annotation completed');
            return annotatedImage;
        }
        catch (error) {
            console.error('❌ Error annotating screenshot:', error);
            return screenshot;
        }
    }
    static getImpactColor(impact) {
        switch (impact) {
            case 'critical': return '#dc2626';
            case 'serious': return '#ea580c';
            case 'moderate': return '#d97706';
            case 'minor': return '#65a30d';
            default: return '#6b7280';
        }
    }
}
AccessibilityService.DIMENSIONS = {
    DESKTOP: { width: 1046, height: 679 },
    MOBILE: { width: 298, height: 742 }
};
//# sourceMappingURL=accessibility-new.service.js.map