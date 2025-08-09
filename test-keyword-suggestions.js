// Test both keyword approaches
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

async function testKeywordSuggestions() {
  console.log('🧪 Testing keyword suggestions with universal strategy...');
  
  const apiToken = process.env.MOZ_API_TOKEN;
  
  // Test with a real keyword that should have suggestions
  const keywordPayload = {
    jsonrpc: "2.0",
    id: `audit-scan-service-keyword-suggestions-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "data.keyword.suggestions.list",
    params: {
      data: {
        serp_query: {
          keyword: "funeral",
          locale: "en-US",
          device: "desktop",
          engine: "google"
        },
        page: {
          n: 0,
          limit: 10
        },
        options: {
          strategy: "universal"
        }
      }
    }
  };
  
  console.log('Testing keyword: "funeral"');
  console.log('Request payload:', JSON.stringify(keywordPayload, null, 2));
  
  try {
    const response = await fetch('https://api.moz.com/jsonrpc', {
      method: 'POST',
      headers: {
        'x-moz-token': apiToken,
        'Content-Type': 'application/json',
        'User-Agent': 'AuditScanService/1.0'
      },
      body: JSON.stringify(keywordPayload)
    });
    
    console.log('Response status:', response.status);
    const responseData = await response.text();
    console.log('Response body:', responseData);
    
    if (response.status === 200) {
      const jsonData = JSON.parse(responseData);
      if (jsonData.result?.suggestions) {
        console.log(`✅ Found ${jsonData.result.suggestions.length} keyword suggestions!`);
        jsonData.result.suggestions.slice(0, 5).forEach((suggestion, index) => {
          console.log(`  ${index + 1}. "${suggestion.keyword}" (relevance: ${suggestion.relevance || 0})`);
        });
      }
    }
    
  } catch (error) {
    console.error('Keyword suggestions API call failed:', error);
  }
}

testKeywordSuggestions();
