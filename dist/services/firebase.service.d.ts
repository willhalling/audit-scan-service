import { AuditResult, PageData } from '../types/index.js';
declare class FirebaseService {
    private db;
    private app;
    constructor();
    private cleanData;
    createAudit(auditId: string, url: string, authorUid?: string): Promise<void>;
    updateAuditStatus(auditId: string, status: AuditResult['status']): Promise<void>;
    updateAuditPages(auditId: string, pages: PageData[]): Promise<void>;
    updateAuditError(auditId: string, error: string): Promise<void>;
    getAudit(auditId: string): Promise<AuditResult | null>;
}
export declare const getFirebaseService: () => FirebaseService;
export declare const firebaseService: {
    readonly instance: FirebaseService;
    createAudit(auditId: string, url: string, authorUid?: string): Promise<void>;
    updateAuditStatus(auditId: string, status: any): Promise<void>;
    updateAuditPages(auditId: string, pages: any[]): Promise<void>;
    updateAuditError(auditId: string, error: string): Promise<void>;
    getAudit(auditId: string): Promise<AuditResult | null>;
};
export {};
//# sourceMappingURL=firebase.service.d.ts.map