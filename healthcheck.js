// Simple script to test if server is running properly
import http from 'http';

// Allow custom port via command line argument
const customPort = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const port = customPort || process.env.PORT || 8080;

const options = {
  hostname: 'localhost',
  port: port,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

console.log(`Checking if server is running on port ${options.port}...`);

// Function to try connecting multiple times
const checkServer = (attempt = 1, maxAttempts = 5) => {
  console.log(`Attempt ${attempt} of ${maxAttempts}...`);
  
  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const parsedData = JSON.parse(data);
        console.log('RESPONSE:', JSON.stringify(parsedData, null, 2));
        console.log('✅ Server is running correctly!');
        process.exit(0);
      } catch (e) {
        console.log('RESPONSE (raw):', data);
        console.log('⚠️ Response is not valid JSON, but server is responding.');
        process.exit(0);
      }
    });
  });
  
  req.on('error', (e) => {
    console.error(`❌ Problem with request: ${e.message}`);
    
    if (attempt < maxAttempts) {
      console.log(`Retrying in 2 seconds...`);
      setTimeout(() => checkServer(attempt + 1, maxAttempts), 2000);
    } else {
      console.error(`Failed after ${maxAttempts} attempts. Is the server running on port ${options.port}?`);
      process.exit(1);
    }
  });
  
  req.end();
};

// Start checking
checkServer();
