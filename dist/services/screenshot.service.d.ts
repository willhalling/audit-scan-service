import { ScreenshotOptions, PageScreenshots } from '../types/index.js';
export declare class ScreenshotService {
    static readonly DIMENSIONS: {
        DESKTOP: {
            width: number;
            height: number;
        };
        MOBILE: {
            width: number;
            height: number;
        };
        DESKTOP_ACCESSIBILITY: {
            width: number;
            height: number;
        };
        MOBILE_ACCESSIBILITY: {
            width: number;
            height: number;
        };
        COVER_PAGE: {
            width: number;
            height: number;
        };
    };
    static takeScreenshot(options: ScreenshotOptions): Promise<Buffer>;
    static takeAndUploadScreenshots(url: string, auditId: string, host: string): Promise<PageScreenshots>;
}
//# sourceMappingURL=screenshot.service.d.ts.map