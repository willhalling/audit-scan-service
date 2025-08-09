// Test keyword suggestions endpoint
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

async function testKeywordEndpoints() {
  console.log('🧪 Testing MOZ keyword endpoints...');
  
  const apiToken = process.env.MOZ_API_TOKEN;
  console.log('API Token:', apiToken ? 'Present' : 'Missing');
  
  // Test keyword suggestions
  const keywordPayload = {
    jsonrpc: "2.0",
    id: `audit-scan-service-keyword-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "data.keyword.suggestions.list",
    params: {
      data: {
        serp_query: {
          keyword: "funeralcollage.com",
          locale: "en-US",
          device: "desktop",
          engine: "google"
        },
        page: {
          n: 0,
          limit: 10
        },
        options: {
          strategy: "default"
        }
      }
    }
  };
  
  console.log('\n1. Testing keyword suggestions...');
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
    
    if (response.status === 404) {
      console.log('❌ Keyword suggestions endpoint not found (404)');
    }
    
  } catch (error) {
    console.error('Keyword suggestions API call failed:', error);
  }

  console.log('\n2. Testing ranking keywords list...');
  
  // Test ranking keywords
  const rankingPayload = {
    jsonrpc: "2.0", 
    id: `audit-scan-service-ranking-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "data.site.ranking-keyword.list",
    params: {
      data: {
        target_query: {
          query: "funeralcollage.com",
          scope: "domain",
          locale: "en-US"
        },
        page: {
          n: 0,
          limit: 10
        },
        options: {
          sort: "rank"
        }
      }
    }
  };
  
  console.log('Request payload:', JSON.stringify(rankingPayload, null, 2));
  
  try {
    const response = await fetch('https://api.moz.com/jsonrpc', {
      method: 'POST',
      headers: {
        'x-moz-token': apiToken,
        'Content-Type': 'application/json',
        'User-Agent': 'AuditScanService/1.0'
      },
      body: JSON.stringify(rankingPayload)
    });
    
    console.log('Response status:', response.status);
    const responseData = await response.text();
    console.log('Response body:', responseData);
    
  } catch (error) {
    console.error('Ranking keywords API call failed:', error);
  }
}

testKeywordEndpoints();
