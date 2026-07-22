// ---------------------------------------------------------------------------
// Shared contract with the managedsites consumer repo — field names must
// match verbatim (see plans/blue-beetle-ice-fantomex.md).
// ---------------------------------------------------------------------------

export interface LighthouseOptions {
  url: string;
  useDesktop?: boolean;
  categories?: string[];
}

export interface LighthouseResult {
  url: string;
  timestamp: string;
  categories: any;
  audits: any;
  opportunities?: LighthouseOpportunity[];
}

export interface LighthouseOpportunity {
  issue: string;
  suggestion: string;
  severity: 'high' | 'medium' | 'low';
}

export interface ScreenshotOptions {
  url: string;
  fullPage?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  hideSelectors?: string[]; // Array of selectors to hide before screenshot
}

export interface AuditRequest {
  url: string;
  pages?: string[]; // Array of page paths (currently only the main page is scanned)
  authorUid?: string; // Optional author UID to associate with the audit
  enableAI?: boolean; // Optional flag to enable/disable AI analysis (default: true)
}

export type AuditStatus =
  | 'pending'
  | 'analysing'
  | 'screenshots'
  | 'performance'
  | 'accessibility'
  | 'business'
  | 'ai'
  | 'completed'
  | 'failed';

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------

export interface AuditScreenshots {
  mobileFoldUrl?: string;
  desktopFoldUrl?: string;
  mobileFullUrl?: string;
  desktopFullUrl?: string;
}

// PageData.screenshots keeps desktopUrl/mobileUrl (fold shots) for backward
// compatibility and adds the four named URLs.
export interface PageScreenshots extends AuditScreenshots {
  desktopUrl?: string;
  mobileUrl?: string;
}

// ---------------------------------------------------------------------------
// Performance (reduced Lighthouse)
// ---------------------------------------------------------------------------

export interface ReducedLighthouseData {
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  firstContentfulPaint: string;
  largestContentfulPaint: string;
  cumulativeLayoutShift: string;
  totalBlockingTime: string;
  speedIndex: string;
  timeToInteractive: string;
  totalByteWeightKb: number;
  requestCount: number;
  imageBytesKb: number;
  opportunities: LighthouseOpportunity[];
}

// ---------------------------------------------------------------------------
// Page data (backward-compatible entry kept on audits/{id}.pages)
// ---------------------------------------------------------------------------

export interface PageMeta {
  title: string;
  description: string;
  language: string;
  viewport?: string;
  canonical: string;
}

export interface PageData {
  url: string;
  pagePath: string;
  meta: PageMeta;
  screenshots: PageScreenshots;
  lighthouseMobile?: ReducedLighthouseData;
  lighthouseDesktop?: ReducedLighthouseData;
}

// ---------------------------------------------------------------------------
// Scan package (audits/{id}.scan)
// ---------------------------------------------------------------------------

export interface ScanPackage {
  website: {
    url: string;
    host: string;
    finalUrl: string;
    title?: string;
    description?: string;
    canonical?: string;
    faviconUrl?: string;
    language?: string;
  };
  pages: string[];
  screenshots: AuditScreenshots;
  performance: {
    mobile: ReducedLighthouseData;
    desktop?: ReducedLighthouseData;
  };
  accessibility: {
    violations: {
      id: string;
      impact: string;
      description: string;
      help: string;
      nodes: string[];
    }[];
    violationCount: number;
    missingAltCount: number;
    missingFormLabelCount: number;
    contrastIssueCount: number;
    headingOrderIssues: string[];
    ariaIssueCount: number;
    keyboardIssueCount: number;
  };
  seo: {
    title?: string;
    description?: string;
    canonical?: string;
    openGraph: Record<string, string>;
    robotsNoindex: boolean;
    structuredDataTypes: string[];
    hasSingleH1: boolean;
  };
  business: {
    phones: string[];
    emails: string[];
    whatsappLinks: string[];
    bookingLinks: string[];
    socialLinks: { platform: string; url: string }[];
    googleMaps: string[];
    openingHours?: string[];
    serviceAreas?: string[];
    ratingValue?: number;
    reviewCount?: number;
    hasReviews: boolean;
    hasTestimonials: boolean;
    awards: string[];
    certifications: string[];
    accreditations: string[];
    guarantees: string[];
  };
  mobile: {
    viewportMeta?: string;
    viewportConfigured: boolean;
    horizontalOverflow: boolean;
    smallTapTargets: { count: number; examples: string[] };
    smallFontSizes: { count: number; examples: string[] };
    stickyElements: { count: number; examples: string[] };
    ctaAboveFold: boolean;
    ctaTexts: string[];
    heroDetected: boolean;
    heroText?: string;
    trustSignalsAboveFold: string[];
    contactInfoAboveFold: { phone: boolean; email: boolean };
    pageHeightViewports: number;
    lazyLoadedImages: number;
  };
  desktop: {
    viewportWidth: number;
    viewportHeight: number;
  };
  extractedContent: {
    headings: { level: number; text: string }[];
    ctas: string[];
    buttons: string[];
    forms: { action?: string; fieldCount: number; hasLabels: boolean }[];
    internalLinkCount: number;
    externalLinkCount: number;
    internalLinks: string[];
    externalLinks: string[];
    imageCount: number;
    imagesMissingAlt: number;
    images: { src: string; alt?: string }[];
    bodyText: string;
    wordCount: number;
    fonts: string[];
    colorPalette: string[];
  };
  structuredData: unknown[];
}

// ---------------------------------------------------------------------------
// AI report (audits/{id}.aiReport)
// ---------------------------------------------------------------------------

export interface AiReport {
  score: number; // 0-100
  summary: string;
  firstImpression: string;
  categories: {
    trust: { score: number; verdict: string };
    mobile: { score: number; verdict: string };
    enquiries: { score: number; verdict: string };
    appearance: { score: number; verdict: string };
    content: { score: number; verdict: string };
  };
  strengths: string[];
  improvements: {
    title: string;
    why: string;
    recommendation: string;
    impact: 'high' | 'medium' | 'low';
  }[];
  quickWins: string[];
  model: string;
  generatedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Firestore document shape (audits/{auditId})
// ---------------------------------------------------------------------------

export interface AuditResult {
  auditId: string;
  host: string;
  url: string;
  status: AuditStatus;
  createdAt: number;
  completedAt?: number;
  pages?: PageData[];
  scan?: ScanPackage;
  aiReport?: AiReport;
  error?: string;
  authorUid?: string; // Optional author UID associated with the audit
}
