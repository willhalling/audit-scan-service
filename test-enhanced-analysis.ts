import { ConversionOptimizationService } from './src/services/conversion-optimization.service.js';
import { PageData } from './src/types/index.js';

// Example of enhanced analysis with real data
const enhancedPageData: PageData = {
  url: 'https://example-saas.com',
  pagePath: '/',
  meta: {
    title: 'ProjectManager Pro - Best Task Management Software',
    description: 'Manage your projects efficiently with our advanced task management software.',
    language: 'en',
    canonical: 'https://example-saas.com'
  },
  isRobotsDoFollow: true,
  hasViewportMetaTag: true,
  canonical: 'https://example-saas.com',
  ctas: ['Start Free Trial', 'Learn More', 'Download App', 'Contact Sales'],
  bodyText: 'Increase your team productivity by 40% with our project management software. Trusted by over 50,000 companies worldwide. Get started today with our 14-day free trial. No credit card required. Advanced reporting features help you track progress. Integrates with Slack, Microsoft Teams, and Google Workspace.',
  textToHtmlRatio: 0.25,
  headers: {
    h1: 'Advanced Project Management for Growing Teams',
    h2: ['Why Choose ProjectManager Pro', 'Features That Save Time', 'Customer Success Stories', 'Pricing Plans', 'Get Started Today'],
    h3: ['Task Automation', 'Real-time Collaboration', 'Advanced Analytics', 'John Smith, CEO', 'Mary Johnson, Manager'],
    h4: [],
    h5: [],
    h6: []
  },
  headerStructure: {
    hasLogicalOrder: true,
    structureIssues: [],
    headerCount: { h1: 1, h2: 5, h3: 5, h4: 0, h5: 0, h6: 0 }
  },
  hasSingleH1: true,
  screenshots: {},
  wordCount: 75,
  trustSignals: {
    hasSSLIndicators: true,
    hasPaymentLogos: true,
    hasSecurityBadges: true,
    hasTestimonials: true,
    hasReviews: true,
    hasPrivacyPolicy: true,
    hasRefundPolicy: false
  },
  analyticsTracking: {
    hasGoogleAnalytics: true,
    hasGTM: true,
    hasFacebookPixel: true,
    hasHotjar: false,
    hasOtherTracking: false
  },
  forms: [{
    inputs: 4,
    requiredFields: 3,
    buttons: 1,
    hasEmailField: true,
    hasPhoneField: true,
    hasNameField: true
  }],
  lighthouseDesktop: {
    performance: 67,
    accessibility: 89,
    bestPractices: 92,
    seo: 88,
    firstContentfulPaint: 1850,
    largestContentfulPaint: 3200,
    cumulativeLayoutShift: 0.08,
    totalBlockingTime: 320,
    speedIndex: 2100
  },
  lighthouseMobile: {
    performance: 42,
    accessibility: 85,
    bestPractices: 88,
    seo: 86,
    firstContentfulPaint: 2800,
    largestContentfulPaint: 5100,
    cumulativeLayoutShift: 0.15,
    totalBlockingTime: 890,
    speedIndex: 4200
  },
  accessibilityDesktop: {
    violations: [
      { id: 'color-contrast', issue: 'Low contrast ratio', suggestion: 'Increase contrast', severity: 'serious' as const, isVisual: true },
      { id: 'image-alt', issue: 'Missing alt text', suggestion: 'Add alt text', severity: 'moderate' as const, isVisual: true }
    ]
  },
  accessibilityMobile: {
    violations: [
      { id: 'color-contrast', issue: 'Low contrast ratio', suggestion: 'Increase contrast', severity: 'serious' as const, isVisual: true },
      { id: 'touch-target', issue: 'Touch targets too small', suggestion: 'Increase touch target size', severity: 'serious' as const, isVisual: true },
      { id: 'image-alt', issue: 'Missing alt text', suggestion: 'Add alt text', severity: 'moderate' as const, isVisual: true }
    ]
  }
};

async function testEnhancedAnalysis() {
  console.log('🧪 Testing Enhanced Conversion Optimization Analysis...');
  console.log('📊 Sample Page Data Summary:');
  console.log(`- URL: ${enhancedPageData.url}`);
  console.log(`- H1: ${enhancedPageData.headers.h1}`);
  console.log(`- CTAs: ${enhancedPageData.ctas.join(', ')}`);
  console.log(`- Mobile Performance: ${enhancedPageData.lighthouseMobile?.performance}/100`);
  console.log(`- Desktop Performance: ${enhancedPageData.lighthouseDesktop?.performance}/100`);
  console.log(`- Accessibility Issues: Desktop: ${enhancedPageData.accessibilityDesktop?.violations.length}, Mobile: ${enhancedPageData.accessibilityMobile?.violations.length}`);
  console.log('');
  
  // This would run the actual AI analysis (requires API key)
  // const analysis = await ConversionOptimizationService.analyzePageForConversion(enhancedPageData, true);
  // console.log('🎯 Analysis Result:', JSON.stringify(analysis, null, 2));
  
  console.log('✅ Enhanced analysis setup complete! The service now provides:');
  console.log('- Detailed goal analysis based on content keywords');
  console.log('- Specific headline recommendations using actual H1');
  console.log('- Header structure validation (H1→H2→H3 hierarchy)');
  console.log('- Real performance metrics with specific values');
  console.log('- CTA quality analysis with action word detection');
}

testEnhancedAnalysis();
