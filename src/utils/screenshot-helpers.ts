/**
 * Shared utility functions for screenshot services
 */

// Array of selectors for elements to hide during screenshots
export const ELEMENTS_TO_HIDE = [
  '#CybotCookiebotDialog',           // Cookiebot dialog
  '.cookiebot-popup',                // Alternative Cookiebot selector
  '#cookie-banner',                  // Generic cookie banner
  '.cookie-banner',                  // Generic cookie banner class
  '.cookie-notice',                  // Cookie notice
  '#cookie-consent',                 // Cookie consent
  '.gdpr-banner',                    // GDPR banner
  '.privacy-banner',                 // Privacy banner
  '[data-testid="cookie-banner"]',   // Data attribute selector
  '.cc-banner',                      // Cookie Consent banner
  '#onetrust-banner-sdk',            // OneTrust cookie banner
  '.onetrust-pc-dark-filter',        // OneTrust overlay
  '#hs-web-interactives-top-push-anchor', // HubSpot elements
  '.hs-overlay',                     // HubSpot overlay
  '[id*="cookie"]',                  // Any element with "cookie" in ID
  '[class*="cookie"]',               // Any element with "cookie" in class
  '.popup-overlay',                  // Generic popup overlay
  '.modal-backdrop'                  // Bootstrap modal backdrop
];

/**
 * Hide specified elements on the page
 * @param page Puppeteer page instance
 * @param additionalSelectors Optional additional selectors to hide
 */
export async function hideElementsForScreenshot(
  page: any, 
  additionalSelectors: string[] = []
): Promise<void> {
  const allSelectors = [...ELEMENTS_TO_HIDE, ...additionalSelectors];
  
  await page.evaluate((selectors: string[]) => {
    console.log(`🙈 Attempting to hide ${selectors.length} element types`);
    let hiddenCount = 0;
    
    selectors.forEach((selector: string) => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el: Element) => {
          if (el && el instanceof HTMLElement) {
            // Check if element is visible before hiding
            const computedStyle = window.getComputedStyle(el);
            if (computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden') {
              el.style.display = 'none';
              hiddenCount++;
            }
          }
        });
      } catch (error) {
        console.warn(`Failed to hide elements with selector: ${selector}`, error);
      }
    });
    
    console.log(`✅ Hidden ${hiddenCount} elements for screenshot`);
  }, allSelectors);
}

/**
 * Wait for page to be ready for screenshot
 * @param page Puppeteer page instance
 * @param additionalWaitTime Additional wait time in milliseconds (default: 2000)
 */
export async function waitForPageReady(
  page: any, 
  additionalWaitTime: number = 2000
): Promise<void> {
  // Wait for any animations or dynamic content to settle
  await new Promise(resolve => setTimeout(resolve, additionalWaitTime));
  
  // Optionally wait for specific conditions
  try {
    await page.waitForFunction(
      () => {
        // Check if page is done loading and animating
        return document.readyState === 'complete' && 
               !document.querySelector('.loading') &&
               !document.querySelector('.spinner');
      },
      { timeout: 5000 }
    ).catch(() => {
      // Ignore timeout, continue with screenshot
      console.log('⏱️ Page ready check timed out, proceeding with screenshot');
    });
  } catch (error) {
    console.log('⏱️ Page ready check failed, proceeding with screenshot');
  }
}
