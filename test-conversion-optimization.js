import { ConversionOptimizationService } from '../src/services/test-conversion-optimization.ts';
import { PageData } from '../src/types/index.js';

// Test the conversion optimization service with sample data
const samplePageData: PageData = {
  url: 'https://example.com',
  pagePath: '/',
  meta: {
    title: 'Get Your Free Marketing Audit - Boost Your Sales Today',
    description: 'Discover how to increase conversions by 300% with our proven marketing strategies. Free audit included.',
    language: 'en',
    canonical: 'https://example.com'
  },
  isRobotsDoFollow: true,
  hasViewportMetaTag: true,
  canonical: 'https://example.com',
  ctas: ['Get Free Audit', 'Start Trial', 'Learn More'],
  bodyText: 'Increase your sales with our proven marketing strategies. Join thousands of satisfied customers who have seen 300% growth. Get your free audit today and start seeing results within 30 days. No risk, money-back guarantee.',
  textToHtmlRatio: 0.3,
  headers: {
    h1: 'Boost Your Sales with Proven Marketing Strategies',
    h2: ['Why Choose Us', 'Customer Success Stories', 'Get Started Today'],
    h3: ['Case Study 1', 'Case Study 2'],
    h4: [],
    h5: [],
    h6: []
  },
  hasSingleH1: true,
  screenshots: {},
  wordCount: 45,
  trustSignals: {
    hasSSLIndicators: true,
    hasPaymentLogos: true,
    hasSecurityBadges: true,
    hasTestimonials: true,
    hasReviews: true,
    hasPrivacyPolicy: true,
    hasRefundPolicy: true
  },
  analyticsTracking: {
    hasGoogleAnalytics: true,
    hasGTM: true,
    hasFacebookPixel: false,
    hasHotjar: true,
    hasOtherTracking: false
  },
  forms: [{
    inputs: 3,
    requiredFields: 2,
    buttons: 1,
    hasEmailField: true,
    hasPhoneField: false,
    hasNameField: true
  }],
  lighthouseDesktop: {
    performance: 85,
    accessibility: 92,
    bestPractices: 88,
    seo: 95,
    firstContentfulPaint: 1200,
    largestContentfulPaint: 2400,
    cumulativeLayoutShift: 0.1,
    totalBlockingTime: 150,
    speedIndex: 1800
  },
  lighthouseMobile: {
    performance: 72,
    accessibility: 90,
    bestPractices: 85,
    seo: 93,
    firstContentfulPaint: 1800,
    largestContentfulPaint: 3200,
    cumulativeLayoutShift: 0.15,
    totalBlockingTime: 250,
    speedIndex: 2500
  }
};

async function testConversionOptimization() {
  console.log('🧪 Testing Conversion Optimization Service...');
  
  try {
    // Test with AI disabled (should return empty object)
    const resultDisabled = await ConversionOptimizationService.analyzePageForConversion(samplePageData, false);
    console.log('✅ AI Disabled Test:', Object.keys(resultDisabled).length === 0 ? 'PASSED' : 'FAILED');
    
    // Test with AI enabled (would require API key and would make actual API call)
    // const resultEnabled = await ConversionOptimizationService.analyzePageForConversion(samplePageData, true);
    // console.log('✅ AI Enabled Test:', resultEnabled);
    
    console.log('🎯 Conversion Optimization Service tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testConversionOptimization();
