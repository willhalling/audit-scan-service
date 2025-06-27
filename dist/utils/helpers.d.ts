export declare const generateRandomUserAgent: () => string;
export declare const generateHeaders: () => {
    'User-Agent': string;
    Accept: string;
    'Accept-Encoding': string;
    'Accept-Language': string;
    Connection: string;
    DNT: string;
    Referer: string;
    'Upgrade-Insecure-Requests': string;
    'Cache-Control': string;
};
export declare const getImpactColor: (impact: string) => string;
export declare const isValidUrl: (url: string) => boolean;
export declare const normalizeUrl: (url: string) => string;
//# sourceMappingURL=helpers.d.ts.map