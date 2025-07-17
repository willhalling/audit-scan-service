import { AccessibilityService } from './dist/services/accessibility-new.service.js';

async function testPembrokeAudit() {
  console.log('🔍 Testing Pembroke accessibility audit...');
  
  try {
    const result = await AccessibilityService.runAccessibilityAudit(
      'https://pembroke.com',
      'test-pembroke-' + Date.now(),
      'localhost'
    );
    
    console.log('✅ Audit completed successfully!');
    console.log('Desktop violations:', result.accessibility.violations.length);
    console.log('Annotated desktop URL:', result.annotatedDesktopUrl || 'None');
    console.log('Annotated mobile URL:', result.annotatedMobileUrl || 'None');
    
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    console.error('Full error:', error);
  }
}

testPembrokeAudit();
