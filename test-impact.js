// Quick test to verify impact standardization
const { getImpactDetails } = require('./dist/types/index.js');

console.log('🔍 Testing impact standardization...');

// Test all impact levels
const impacts = ['critical', 'serious', 'moderate', 'minor'];

impacts.forEach(impact => {
  const details = getImpactDetails(impact);
  console.log(`${impact}:`, {
    level: details.level,
    color: details.color,
    priority: details.priority
  });
});

console.log('✅ Impact standardization test completed');
