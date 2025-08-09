// Test file for MOZ Service
// Run with: npm run build && node test-moz.js

import { MozService } from './dist/services/moz.service.js';
import dotenv from 'dotenv';

dotenv.config();

async function testMozService() {
  console.log('🧪 Testing MOZ Service...\n');

  // Test 1: Check if enabled
  console.log('1. Checking MOZ API enabled status...');
  const isEnabled = MozService.isEnabled();
  console.log(`   Enabled: ${isEnabled ? '✅' : '❌'}`);
  
  if (!isEnabled) {
    console.log('   ⚠️  MOZ API is disabled. Set MOZ_ENABLED=true to enable.');
    console.log('   Example:');
    console.log('   export MOZ_ENABLED=true');
    console.log('   export MOZ_API_TOKEN="your_api_token"');
    return;
  }

  // Test 2: Check configuration
  console.log('\n2. Checking MOZ API configuration...');
  const isConfigured = MozService.isConfigured();
  console.log(`   Configured: ${isConfigured ? '✅' : '❌'}`);
  
  if (!isConfigured) {
    console.log('   ⚠️  Please set MOZ_API_TOKEN environment variable');
    console.log('   Example:');
    console.log('   export MOZ_API_TOKEN="your_api_token"');
    return;
  }

  // Test 3: Test connectivity
  console.log('\n3. Testing MOZ API connectivity...');
  try {
    const connectionTest = await MozService.testConnection();
    console.log(`   Connection: ${connectionTest.success ? '✅' : '❌'}`);
    console.log(`   Message: ${connectionTest.message}`);
  } catch (error) {
    console.log(`   Connection: ❌`);
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test 4: Get metrics for a single URL
  console.log('\n4. Getting metrics for funeralcollage.com...');
  try {
    const metrics = await MozService.getUrlMetrics('funeralcollage.com');
    console.log('   ✅ Metrics retrieved successfully:');
    console.log(`   - Domain Authority: ${metrics.domainAuthority}`);
    console.log(`   - Page Authority: ${metrics.pageAuthority}`);
    console.log(`   - Spam Score: ${metrics.spamScore}`);
    console.log(`   - Linking Domains: ${metrics.linkingDomains}`);
    console.log(`   - Total Links: ${metrics.totalLinks}`);
    console.log(`   - MozRank: ${metrics.mozRank}`);
    console.log(`   - MozTrust: ${metrics.mozTrust}`);
    
    if (metrics.error) {
      console.log(`   ⚠️  Error: ${metrics.error}`);
    }
  } catch (error) {
    console.log(`   ❌ Failed to get metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test 5: Test keyword research
  console.log('\n5. Getting keyword data for funeralcollage.com...');
  try {
    const keywords = await MozService.getKeywordData('funeralcollage.com', ['funeral slideshow', 'funeral video', 'memorial slideshow']);
    console.log(`   ✅ Retrieved ${keywords.length} keywords:`);
    
    keywords.slice(0, 5).forEach((keyword, index) => {
      console.log(`   ${index + 1}. ${keyword.keyword}:`);
      console.log(`      - Difficulty: ${keyword.difficulty}`);
      console.log(`      - Volume: ${keyword.volume}`);
      console.log(`      - Priority: ${keyword.priority}`);
    });
    
    if (keywords.length > 5) {
      console.log(`   ... and ${keywords.length - 5} more keywords`);
    }
  } catch (error) {
    console.log(`   ❌ Failed to get keyword data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test 6: Test competitor analysis
  console.log('\n6. Getting competitor data for funeralcollage.com...');
  try {
    const competitors = await MozService.getCompetitorData('funeralcollage.com', 5);
    console.log(`   ✅ Retrieved ${competitors.length} competitors:`);
    
    competitors.forEach((competitor, index) => {
      console.log(`   ${index + 1}. ${competitor.url}:`);
      console.log(`      - DA: ${competitor.domainAuthority}, PA: ${competitor.pageAuthority}`);
      console.log(`      - Competition Level: ${competitor.competitionLevel}`);
      console.log(`      - Common Keywords: ${competitor.commonKeywords || 0}`);
    });
  } catch (error) {
    console.log(`   ❌ Failed to get competitor data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test 7: Test full analysis
  console.log('\n7. Getting full MOZ analysis for funeralcollage.com...');
  try {
    const analysis = await MozService.getFullAnalysis('funeralcollage.com', {
      includeKeywords: true,
      includeCompetitors: true,
      keywords: ['funeral', 'memorial', 'collage'],
      competitorLimit: 3
    });
    
    console.log('   ✅ Full analysis completed:');
    console.log(`   - Domain Authority: ${analysis.metrics.domainAuthority}`);
    console.log(`   - Page Authority: ${analysis.metrics.pageAuthority}`);
    console.log(`   - Keywords found: ${analysis.keywords?.length || 0}`);
    console.log(`   - Competitors found: ${analysis.competitors?.length || 0}`);
    
    if (analysis.rateLimitRemaining !== undefined) {
      console.log(`   - Rate limit remaining: ${analysis.rateLimitRemaining}`);
    }
    
    if (analysis.error) {
      console.log(`   ⚠️  Error: ${analysis.error}`);
    }
  } catch (error) {
    console.log(`   ❌ Failed to get full analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test 8: Test bulk metrics (smaller batch)
  console.log('\n8. Getting bulk metrics for multiple URLs...');
  try {
    const urls = ['funeralcollage.com', 'google.com'];
    const bulkMetrics = await MozService.getBulkUrlMetrics(urls);
    console.log(`   ✅ Retrieved metrics for ${bulkMetrics.length} URLs:`);
    
    bulkMetrics.forEach((metric, index) => {
      console.log(`   ${index + 1}. ${metric.url}:`);
      console.log(`      - DA: ${metric.domainAuthority}, PA: ${metric.pageAuthority}`);
      if (metric.error) {
        console.log(`      - Error: ${metric.error}`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Failed to get bulk metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  console.log('\n🎉 MOZ Service testing completed!');
  console.log('\n📚 Available API endpoints:');
  console.log('   - GET /moz/status - Check API status');
  console.log('   - GET /moz/metrics?url=funeralcollage.com - Get basic metrics');
  console.log('   - POST /moz/bulk-metrics - Get metrics for multiple URLs');
  console.log('   - GET /moz/keywords?domain=funeralcollage.com - Get keyword research');
  console.log('   - GET /moz/competitors?domain=funeralcollage.com - Get competitor analysis');
  console.log('   - GET /moz/analysis?url=funeralcollage.com&keywords=true&competitors=true - Full analysis');
}

// Run the test
testMozService().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
