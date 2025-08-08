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
  '.modal-backdrop',                 // Bootstrap modal backdrop
  // Map-related elements to hide
  '[id*="map"]',                     // Any element with "map" in ID
  '[class*="map"]',                  // Any element with "map" in class
  '.leaflet-container',              // Leaflet map container
  '.mapboxgl-map',                   // Mapbox GL container
  '.google-map',                     // Google Maps container
  'iframe[src*="maps"]',             // Map iframes
  '.osm-map'                         // OpenStreetMap container
];

/**
 * Block aggressive map resources and problematic domains
 * @param page Puppeteer page instance
 */
export async function blockAggressiveMapResources(page: any): Promise<void> {
  await page.setRequestInterception(true);
  
  page.on('request', (req: any) => {
    const url = req.url();
    const resourceType = req.resourceType();
    
    // Block all known map-related domains and resources
    const blockedDomains = [
      'openstreetmap.org',
      'tile.openstreetmap.org', 
      'tiles.openstreetmap.org',
      'osm.org',
      'tiles.hyteck.de',
      'maps.googleapis.com',
      'maps.google.com',
      'mapbox.com',
      'mapboxgl.com',
      'leafletjs.com',
      'unpkg.com/leaflet',
      'cdnjs.cloudflare.com/ajax/libs/leaflet'
    ];
    
    // Block specific resource patterns
    const blockedPatterns = [
      '/tiles/',
      '/tile/',
      '.tile',
      'vector-tile',
      'geojson',
      'mapserver',
      'wms',
      'wmts',
      'tms'
    ];
    
    // Check if URL contains blocked domains or patterns
    const shouldBlock = blockedDomains.some(domain => url.includes(domain)) ||
                       blockedPatterns.some(pattern => url.includes(pattern)) ||
                       (resourceType === 'image' && (url.includes('tile') || url.includes('map'))) ||
                       (resourceType === 'xhr' && url.includes('tile')) ||
                       (resourceType === 'fetch' && url.includes('tile'));
    
    if (shouldBlock) {
      console.log(`🚫 BLOCKING: ${url}`);
      req.abort();
    } else {
      req.continue();
    }
  });
  
  console.log(`�️ Aggressive map resource blocking enabled`);
}

/**
 * Hide elements that commonly interfere with screenshots
 * @param page Puppeteer page instance
 * @param additionalSelectors Optional additional selectors to hide
 */
export async function hideElementsForScreenshot(
  page: any, 
  additionalSelectors: string[] = []
): Promise<void> {
  const allSelectors = [...ELEMENTS_TO_HIDE, ...additionalSelectors];
  
  // Wait for late-loading elements like cookie banners to appear
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  try {
    console.log(`🙈 Hiding elements for screenshot...`);
    
    // Add timeout wrapper to prevent hanging
    await Promise.race([
      page.evaluate((selectors: string[]) => {
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
      }, allSelectors),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Hide elements timeout after 8 seconds')), 8000)
      )
    ]);
    
    console.log(`✅ Element hiding completed successfully`);
    
  } catch (error) {
    console.warn(`⚠️ Element hiding failed or timed out:`, error);
    // Continue without hiding elements - better to get a screenshot with elements than hang
  }
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
  // Simple wait for any animations or dynamic content to settle
  // Removed page.waitForFunction() as it can hang indefinitely
  console.log(`⏱️ Waiting ${additionalWaitTime}ms for page to be ready...`);
  await new Promise(resolve => setTimeout(resolve, additionalWaitTime));
  console.log(`✅ Page ready wait completed`);
}
