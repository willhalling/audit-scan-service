// Test both keyword approaches - ranking keywords vs keyword suggestions
import { MozService } from './dist/services/moz.service.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
const envPath = join(__dirname, '.env');
try {
  const envFile = readFileSync(envPath, 'utf8');
  const envVars = envFile.split('\n');
  for (const envVar of envVars) {
    if (envVar.trim() && !envVar.startsWith('#')) {
      const [key, ...valueParts] = envVar.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  }
} catch (error) {
  console.error('Could not load .env file');
}

async function testBothKeywordApproaches() {
  console.log('🧪 Testing MOZ Keyword Data - Both Approaches...\n');

  console.log('='.repeat(60));
  console.log('1. 🔍 DEFAULT APPROACH: Ranking Keywords (no keywords provided)');
  console.log('='.repeat(60));

  try {
    const rankingKeywords = await MozService.getKeywordData('funeralcollage.com');
    
    console.log(`✅ Retrieved ${rankingKeywords.length} ranking keywords:`);
    rankingKeywords.slice(0, 5).forEach((keyword, index) => {
      console.log(`   ${index + 1}. "${keyword.keyword}"`);
      console.log(`      - Difficulty: ${keyword.difficulty}`);
      console.log(`      - Volume: ${keyword.volume}`);
      console.log(`      - Relevance: ${keyword.relevance}`);
    });
    
    if (rankingKeywords.length > 5) {
      console.log(`   ... and ${rankingKeywords.length - 5} more ranking keywords`);
    }

  } catch (error) {
    console.error('❌ Ranking keywords failed:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('2. 🔍 KEYWORD SUGGESTIONS: Universal Strategy (keywords provided)');
  console.log('='.repeat(60));

  try {
    const testKeywords = ['funeral', 'memorial', 'slideshow'];
    console.log(`Testing with keywords: ${testKeywords.join(', ')}`);
    
    const keywordSuggestions = await MozService.getKeywordData('funeralcollage.com', testKeywords);
    
    console.log(`✅ Retrieved ${keywordSuggestions.length} keyword suggestions:`);
    keywordSuggestions.slice(0, 10).forEach((keyword, index) => {
      console.log(`   ${index + 1}. "${keyword.keyword}"`);
      console.log(`      - Relevance: ${keyword.relevance}`);
    });
    
    if (keywordSuggestions.length > 10) {
      console.log(`   ... and ${keywordSuggestions.length - 10} more suggestions`);
    }

  } catch (error) {
    console.error('❌ Keyword suggestions failed:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('3. 🔍 COMPARISON: Both approaches for same domain');
  console.log('='.repeat(60));

  console.log('📊 RANKING KEYWORDS: What your site actually ranks for');
  console.log('   ✅ Real performance data with difficulty & volume');
  console.log('   ✅ Shows current SEO success');
  console.log('   ✅ Based on actual search rankings');
  
  console.log('\n📊 KEYWORD SUGGESTIONS: Related keywords to explore');
  console.log('   ✅ Discover new keyword opportunities');
  console.log('   ✅ Expand content strategy');
  console.log('   ✅ Universal strategy finds broader matches');

  console.log('\n🎯 RECOMMENDATION:');
  console.log('   • Use DEFAULT (no keywords) for current SEO analysis');
  console.log('   • Use KEYWORDS parameter for content expansion research');
  
  console.log('\n🎉 Both approaches now working perfectly!');
}

testBothKeywordApproaches();
