import { AuditService } from '../services/audit.service.js';
import { AuditRequest } from '../types/index.js';

/**
 * Examples of how to use the enhanced audit system with CTA Analysis
 */

// Example 1: Basic audit with CTA analysis enabled (default)
export async function runBasicAuditWithCTA(url: string) {
  const auditRequest: AuditRequest = {
    url,
    enableAI: true,
    enableCTAAnalysis: true, // Enable CTA visual analysis
    maxCTAsToAnalyze: 3 // Analyze top 3 CTAs for performance
  };

  const auditId = 'audit-' + Date.now();
  const result = await AuditService.startAudit({ ...auditRequest, auditId });
  
  console.log(`🎯 Started enhanced audit with CTA analysis: ${result.auditId}`);
  return result;
}

// Example 2: Performance-focused audit (CTA analysis disabled)
export async function runFastAudit(url: string) {
  const auditRequest: AuditRequest = {
    url,
    enableAI: true,
    enableCTAAnalysis: false, // Disable for speed
    maxCTAsToAnalyze: 0
  };

  const auditId = 'fast-audit-' + Date.now();
  const result = await AuditService.startAudit({ ...auditRequest, auditId });
  
  console.log(`⚡ Started fast audit without CTA analysis: ${result.auditId}`);
  return result;
}

// Example 3: Comprehensive audit with maximum CTA analysis
export async function runComprehensiveAudit(url: string, pages?: string[]) {
  const auditRequest: AuditRequest = {
    url,
    ...(pages && { pages }), // Only include pages if defined
    enableAI: true,
    enableCTAAnalysis: true,
    maxCTAsToAnalyze: 5 // Analyze more CTAs for deep insights
  };

  const auditId = 'comprehensive-audit-' + Date.now();
  const result = await AuditService.startAudit({ ...auditRequest, auditId });
  
  console.log(`🔍 Started comprehensive audit: ${result.auditId}`);
  return result;
}

// Example 4: Development/testing audit with verbose CTA analysis
export async function runDevelopmentAudit(url: string) {
  const auditRequest: AuditRequest = {
    url,
    enableAI: true,
    enableCTAAnalysis: true,
    maxCTAsToAnalyze: 10 // Analyze many CTAs for testing
  };

  const auditId = 'dev-audit-' + Date.now();
  const result = await AuditService.startAudit({ ...auditRequest, auditId });
  
  console.log(`🔧 Started development audit with extensive CTA analysis: ${result.auditId}`);
  return result;
}

/**
 * Configuration presets for different use cases
 */
export const AuditPresets = {
  // Production: Balanced performance and insights
  production: {
    enableAI: true,
    enableCTAAnalysis: true,
    maxCTAsToAnalyze: 3
  },
  
  // Fast: Skip CTA analysis for speed
  fast: {
    enableAI: true,
    enableCTAAnalysis: false,
    maxCTAsToAnalyze: 0
  },
  
  // Comprehensive: Maximum analysis
  comprehensive: {
    enableAI: true,
    enableCTAAnalysis: true,
    maxCTAsToAnalyze: 5
  },
  
  // Development: Extensive testing
  development: {
    enableAI: true,
    enableCTAAnalysis: true,
    maxCTAsToAnalyze: 10
  },
  
  // AI only: Skip CTA analysis but keep AI
  aiOnly: {
    enableAI: true,
    enableCTAAnalysis: false,
    maxCTAsToAnalyze: 0
  }
};

/**
 * Helper function to run audit with preset configuration
 */
export async function runAuditWithPreset(
  url: string, 
  preset: keyof typeof AuditPresets,
  pages?: string[]
) {
  const config = AuditPresets[preset];
  const auditRequest: AuditRequest = {
    url,
    ...(pages && { pages }), // Only include pages if defined
    ...config
  };

  const auditId = `${preset}-audit-${Date.now()}`;
  const result = await AuditService.startAudit({ ...auditRequest, auditId });
  
  console.log(`🎯 Started ${preset} audit: ${result.auditId}`);
  return result;
}

/**
 * Usage examples:
 * 
 * // Production audit with CTA analysis
 * await runAuditWithPreset('https://example.com', 'production');
 * 
 * // Fast audit without CTA analysis
 * await runAuditWithPreset('https://example.com', 'fast');
 * 
 * // Comprehensive multi-page audit
 * await runAuditWithPreset('https://example.com', 'comprehensive', ['/pricing', '/about']);
 * 
 * // Custom configuration
 * await runBasicAuditWithCTA('https://example.com');
 */
