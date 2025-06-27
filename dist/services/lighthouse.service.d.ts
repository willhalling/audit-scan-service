import { LighthouseConfig, LighthouseResult } from '../types/index.js';
export declare class LighthouseService {
    private static queue;
    private static isProcessing;
    private static readonly DESKTOP_CONFIG;
    private static readonly MOBILE_CONFIG;
    private static processQueue;
    private static queueLighthouse;
    static runLighthouse(config: LighthouseConfig): Promise<LighthouseResult>;
    static getLighthouseSummary(config: LighthouseConfig): Promise<{
        url: string;
        timestamp: string;
        performance: number;
        accessibility: number;
        bestPractices: number;
        seo: number;
        categories: any;
        audits: any;
    }>;
}
//# sourceMappingURL=lighthouse.service.d.ts.map