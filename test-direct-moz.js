// Test direct API call to MOZ
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

async function testDirectMozAPI() {
  console.log('🧪 Testing direct MOZ API call...');
  
  const apiToken = process.env.MOZ_API_TOKEN;
  console.log('API Token:', apiToken ? 'Present' : 'Missing');
  
  const requestPayload = {
    jsonrpc: "2.0",
    id: `audit-scan-service-data-site-metrics-fetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "data.site.metrics.fetch",
    params: {
      data: {
        site_query: {
          query: "example.com",
          scope: "domain"
        }
      }
    }
  };
  
  console.log('Request payload:', JSON.stringify(requestPayload, null, 2));
  
  try {
    const response = await fetch('https://api.moz.com/jsonrpc', {
      method: 'POST',
      headers: {
        'x-moz-token': apiToken,
        'Content-Type': 'application/json',
        'User-Agent': 'AuditScanService/1.0'
      },
      body: JSON.stringify(requestPayload)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseData = await response.text();
    console.log('Response body:', responseData);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const jsonData = JSON.parse(responseData);
    console.log('Parsed response:', JSON.stringify(jsonData, null, 2));
    
  } catch (error) {
    console.error('API call failed:', error);
  }
}

testDirectMozAPI();
