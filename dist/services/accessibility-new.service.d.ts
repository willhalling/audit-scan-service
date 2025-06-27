import { PageAccessibilityData } from '../types/index.js';
export declare class AccessibilityService {
    static readonly DIMENSIONS: {
        DESKTOP: {
            width: number;
            height: number;
        };
        MOBILE: {
            width: number;
            height: number;
        };
    };
    static runAccessibilityAudit(url: string, auditId: string, host: string): Promise<{
        accessibility: PageAccessibilityData;
        annotatedDesktopUrl?: string;
        annotatedMobileUrl?: string;
    }>;
    private static runSingleAccessibilityAudit;
    private static getElementCoordinates;
    private static annotateScreenshot;
    private static getImpactColor;
}
//# sourceMappingURL=accessibility-new.service.d.ts.map