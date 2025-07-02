import { ImpactLevel, getImpactDetails, AuditIssue, AuditSuggestion } from '../types/index.js';

/**
 * Utility functions for analyzing and standardizing impact levels across different audit types
 */
export class ImpactAnalyzer {
  
  /**
   * Determines impact level based on Lighthouse audit score
   * @param score - Lighthouse audit score (0-1 or 0-100)
   * @param auditType - Type of audit (performance, accessibility, etc.)
   * @returns Impact level
   */
  static getImpactFromLighthouseScore(score: number, auditType: string): ImpactLevel {
    // Normalize score to 0-1 range
    const normalizedScore = score > 1 ? score / 100 : score;
    
    // More strict criteria for accessibility and security
    if (auditType === 'accessibility' || auditType === 'security') {
      if (normalizedScore < 0.5) return 'critical';
      if (normalizedScore < 0.7) return 'serious';
      if (normalizedScore < 0.9) return 'moderate';
      return 'minor';
    }
    
    // Standard criteria for performance, SEO, best practices
    if (normalizedScore < 0.4) return 'critical';
    if (normalizedScore < 0.6) return 'serious';
    if (normalizedScore < 0.8) return 'moderate';
    return 'minor';
  }

  /**
   * Determines impact level based on Lighthouse audit display value and scoring
   * @param audit - Lighthouse audit object
   * @param category - Category of the audit
   * @returns Impact level
   */
  static getImpactFromLighthouseAudit(audit: any, category: string): ImpactLevel {
    // Check if audit has a score
    if (audit.score !== null && audit.score !== undefined) {
      return this.getImpactFromLighthouseScore(audit.score, category);
    }
    
    // For audits without scores, use display value patterns
    if (audit.displayValue) {
      const displayValue = audit.displayValue.toLowerCase();
      
      // Time-based impacts (for performance)
      if (displayValue.includes('s') || displayValue.includes('ms')) {
        const timeMatch = displayValue.match(/(\d+(?:\.\d+)?)\s*(s|ms)/);
        if (timeMatch) {
          const time = parseFloat(timeMatch[1]);
          const unit = timeMatch[2];
          const timeInMs = unit === 's' ? time * 1000 : time;
          
          if (timeInMs > 5000) return 'critical';
          if (timeInMs > 2500) return 'serious';
          if (timeInMs > 1000) return 'moderate';
          return 'minor';
        }
      }
      
      // Size-based impacts
      if (displayValue.includes('kb') || displayValue.includes('mb')) {
        const sizeMatch = displayValue.match(/(\d+(?:\.\d+)?)\s*(kb|mb)/);
        if (sizeMatch) {
          const size = parseFloat(sizeMatch[1]);
          const unit = sizeMatch[2];
          const sizeInKb = unit === 'mb' ? size * 1024 : size;
          
          if (sizeInKb > 1000) return 'serious';
          if (sizeInKb > 500) return 'moderate';
          return 'minor';
        }
      }
    }
    
    // Default to moderate for failed audits
    return 'moderate';
  }

  /**
   * Extracts issues and opportunities from Lighthouse results
   * @param lighthouseResult - Full Lighthouse result object
   * @returns Object containing issues, opportunities, and diagnostics
   */
  static extractLighthouseIssues(lighthouseResult: any): {
    issues: AuditIssue[];
    opportunities: AuditSuggestion[];
    diagnostics: AuditIssue[];
  } {
    const issues: AuditIssue[] = [];
    const opportunities: AuditSuggestion[] = [];
    const diagnostics: AuditIssue[] = [];
    
    // Process audits
    if (lighthouseResult.audits) {
      Object.entries(lighthouseResult.audits).forEach(([auditId, audit]: [string, any]) => {
        if (!audit || audit.score === null || audit.score >= 0.9) {
          return; // Skip passed audits
        }
        
        const category = this.getCategoryFromAuditId(auditId);
        const impact = this.getImpactFromLighthouseAudit(audit, category);
        const impactDetails = getImpactDetails(impact);
        
        // Determine if it's an opportunity (has potential savings)
        if (audit.details?.overallSavingsMs || audit.details?.overallSavingsBytes || 
            audit.numericValue || auditId.includes('unused') || auditId.includes('optimize')) {
          opportunities.push({
            id: auditId,
            title: audit.title || auditId,
            description: audit.description || '',
            impact,
            impactDetails,
            category: category as any,
            source: 'lighthouse',
            fix: audit.help || '',
            documentation: audit.helpText || '',
            potentialSavings: audit.displayValue || this.formatSavings(audit)
          });
        } else if (auditId.includes('diagnostic') || category === 'best-practices') {
          diagnostics.push({
            id: auditId,
            title: audit.title || auditId,
            description: audit.description || '',
            impact,
            impactDetails,
            category: category as any,
            source: 'lighthouse',
            fix: audit.help || '',
            documentation: audit.helpText || ''
          });
        } else {
          issues.push({
            id: auditId,
            title: audit.title || auditId,
            description: audit.description || '',
            impact,
            impactDetails,
            category: category as any,
            source: 'lighthouse',
            fix: audit.help || '',
            documentation: audit.helpText || ''
          });
        }
      });
    }
    
    return { issues, opportunities, diagnostics };
  }

  /**
   * Determines category from Lighthouse audit ID
   * @param auditId - Lighthouse audit ID
   * @returns Category string
   */
  private static getCategoryFromAuditId(auditId: string): string {
    if (auditId.includes('accessibility') || auditId.includes('aria') || 
        auditId.includes('alt') || auditId.includes('label')) {
      return 'accessibility';
    }
    if (auditId.includes('performance') || auditId.includes('speed') || 
        auditId.includes('paint') || auditId.includes('layout')) {
      return 'performance';
    }
    if (auditId.includes('seo') || auditId.includes('meta') || 
        auditId.includes('title') || auditId.includes('canonical')) {
      return 'seo';
    }
    if (auditId.includes('security') || auditId.includes('https') || 
        auditId.includes('mixed-content')) {
      return 'security';
    }
    return 'best-practices';
  }

  /**
   * Formats potential savings from Lighthouse audit
   * @param audit - Lighthouse audit object
   * @returns Formatted savings string
   */
  private static formatSavings(audit: any): string {
    if (audit.details?.overallSavingsMs) {
      return `${Math.round(audit.details.overallSavingsMs)}ms`;
    }
    if (audit.details?.overallSavingsBytes) {
      const kb = audit.details.overallSavingsBytes / 1024;
      return kb > 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${kb.toFixed(1)}KB`;
    }
    if (audit.numericValue) {
      return audit.numericUnit === 'millisecond' ? 
        `${Math.round(audit.numericValue)}ms` : 
        audit.numericValue.toString();
    }
    return '';
  }

  /**
   * Standardizes impact level from any audit system
   * @param impact - Impact from various systems (string or number)
   * @param system - System that provided the impact
   * @returns Standardized impact level
   */
  static standardizeImpact(impact: any, system: 'axe' | 'lighthouse' | 'custom'): ImpactLevel {
    if (typeof impact === 'string') {
      const lowercaseImpact = impact.toLowerCase();
      if (['critical', 'high', 'severe'].includes(lowercaseImpact)) return 'critical';
      if (['serious', 'major', 'important'].includes(lowercaseImpact)) return 'serious';
      if (['moderate', 'medium', 'warning'].includes(lowercaseImpact)) return 'moderate';
      if (['minor', 'low', 'info'].includes(lowercaseImpact)) return 'minor';
    }
    
    if (typeof impact === 'number') {
      // Lighthouse scores (0-1 range)
      if (impact <= 1) {
        if (impact < 0.4) return 'critical';
        if (impact < 0.6) return 'serious';
        if (impact < 0.8) return 'moderate';
        return 'minor';
      }
      
      // Lighthouse scores (0-100 range)
      if (impact <= 100) {
        if (impact < 40) return 'critical';
        if (impact < 60) return 'serious';
        if (impact < 80) return 'moderate';
        return 'minor';
      }
    }
    
    // Default to moderate for unknown impacts
    return 'moderate';
  }
}
