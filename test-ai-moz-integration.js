// Test file for AI + MOZ Integration
// Run with: npm run build && node test-ai-moz-integration.js

import { AIService } from './dist/services/ai.service.js';
import { MozService } from './dist/services/moz.service.js';
import { ScrapeService } from './dist/services/scrape.service.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAIMozIntegration() {
  console.log('🧪 Testing AI + MOZ Integration...\n');

  // Test with user's actual domain
const testUrl = 'https://funeralcollage.com';
  
  // Check if services are enabled
  console.log('1. Checking service availability...');
  const mozEnabled = MozService.isEnabled() && MozService.isConfigured();
  console.log(`   MOZ API: ${mozEnabled ? '✅' : '❌'}`);
  
  if (!mozEnabled) {
    console.log('   ⚠️  MOZ API is not properly configured');
    return;
  }

  try {
    // Step 1: Scrape the website to get page data
    console.log(`\n2. Scraping website: ${testUrl}...`);
    const pageData = await ScrapeService.scrapePage(testUrl);
    
    if (!pageData) {
      throw new Error('Failed to scrape website');
    }

    console.log(`   ✅ Scraped successfully`);
    console.log(`   Title: ${pageData.meta.title}`);
    console.log(`   H1: ${pageData.headers.h1}`);
    console.log(`   Word count: ${pageData.wordCount}`);

    // Step 2: Generate AI keywords
    console.log(`\n3. Generating AI keywords...`);
    const aiKeywords = await AIService.generateKeywords(pageData, true);
    console.log(`   ✅ Generated keywords: ${aiKeywords.join(', ')}`);

    // Step 3: Run full AI analysis (which includes keyword generation)
    console.log(`\n4. Running full AI analysis...`);
    const aiAnalysis = await AIService.analyzePage(pageData, true);
    console.log(`   ✅ AI analysis completed`);
    console.log(`   Keywords in meta: ${aiAnalysis.meta.keywords?.join(', ') || 'None'}`);
    console.log(`   Meta title suggestion: ${aiAnalysis.meta.title.suggestions}`);

    // Step 4: Use AI keywords for MOZ analysis
    console.log(`\n5. Running MOZ analysis with AI keywords...`);
    const domain = testUrl.replace(/^https?:\/\//, '').split('/')[0];
    
    // Test MOZ with AI-generated keywords
    const mozAnalysis = await MozService.getFullAnalysis(testUrl, {
      includeKeywords: true,
      keywords: aiAnalysis.meta.keywords || []
    });

    console.log(`   ✅ MOZ analysis completed`);
    console.log(`   Domain Authority: ${mozAnalysis.metrics.domainAuthority}`);
    console.log(`   Page Authority: ${mozAnalysis.metrics.pageAuthority}`);
    console.log(`   Linking Domains: ${mozAnalysis.metrics.linkingDomains}`);
    console.log(`   Total Links: ${mozAnalysis.metrics.totalLinks}`);
    console.log(`   Spam Score: ${mozAnalysis.metrics.spamScore}`);
    console.log(`   Keywords found: ${mozAnalysis.keywords?.length || 0}`);

    // Display keyword prioritization data
    if (mozAnalysis.keywords && mozAnalysis.keywords.length > 0) {
      console.log(`\n6. Keyword prioritization results:`);
      mozAnalysis.keywords.slice(0, 5).forEach((keyword, index) => {
        console.log(`   ${index + 1}. "${keyword.keyword}"`);
        console.log(`      Volume: ${keyword.volume}, Difficulty: ${keyword.difficulty}, Opportunity: ${keyword.opportunity}`);
      });
    } else {
      console.log(`\n6. No keyword data returned`);
    }

    // Test without AI keywords (old approach)
    console.log(`\n7. Testing MOZ without AI keywords (for comparison)...`);
    const mozAnalysisOld = await MozService.getFullAnalysis(testUrl, {
      includeKeywords: true
      // No keywords parameter - should return empty array now
    });

    console.log(`   Keywords found (old approach): ${mozAnalysisOld.keywords?.length || 0}`);
    console.log(`   This should be 0 now to avoid irrelevant data`);

    console.log(`\n🎉 AI + MOZ Integration test completed successfully!`);
    
    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`   AI Keywords Generated: ${aiAnalysis.meta.keywords?.length || 0}`);
    console.log(`   MOZ Keywords (with AI): ${mozAnalysis.keywords?.length || 0}`);
    console.log(`   MOZ Keywords (without AI): ${mozAnalysisOld.keywords?.length || 0}`);
    console.log(`   Domain Authority: ${mozAnalysis.metrics.domainAuthority}`);
    console.log(`   Page Authority: ${mozAnalysis.metrics.pageAuthority}`);

  } catch (error) {
    console.error(`❌ Test failed:`, error);
  }
}

// Run the test
testAIMozIntegration().catch(console.error);
