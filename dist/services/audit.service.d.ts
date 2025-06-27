import { AuditRequest } from '../types/index.js';
export declare class AuditService {
    static generateAuditId(url: string): string;
    static validateUrl(url: string): Promise<{
        valid: boolean;
        error?: string;
    }>;
    static startAudit(request: AuditRequest): Promise<{
        auditId: string;
        error?: string;
    }>;
    private static runAudit;
    static getAuditStatus(auditId: string): Promise<import("../types/index.js").AuditResult | null>;
}
//# sourceMappingURL=audit.service.d.ts.map