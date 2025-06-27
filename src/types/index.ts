export interface LighthouseConfig {
  url: string;
  useDesktop?: boolean;
  categories?: string[];
}

export interface LighthouseResult {
  url: string;
  timestamp: string;
  categories: any;
  audits: any;
}

export interface ScrapeResult {
  url: string;
  title: string;
  description: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  links: string[];
  images: string[];
  ctas: string[];
  forms: FormInfo[];
  socialLinks: SocialPlatforms;
  brokenLinks: {
    broken: string[];
    valid: string[];
    brokenExamples: string[];
  };
  pageCount: number;
  contentAnalysis: ContentAnalysis;
}

export interface FormInfo {
  inputs: number;
  requiredFields: number;
  buttons: number;
}

export interface SocialPlatforms {
  x: boolean;
  facebook: boolean;
  linkedin: boolean;
  instagram: boolean;
  tiktok: boolean;
  youtube: boolean;
  pinterest: boolean;
  missingSocials: string[];
}

export interface ContentAnalysis {
  wordCount: number;
  readabilityScore: number;
  keywordDensity: { [key: string]: number };
  sentimentScore: number;
}

export interface AccessibilityViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: {
    target: string[];
    html: string;
    failureSummary: string;
  }[];
}

export interface AccessibilityResult {
  url: string;
  timestamp: string;
  violations: AccessibilityViolation[];
  passes: any[];
  incomplete: any[];
  inapplicable: any[];
  score: AccessibilityScore;
}

export interface AccessibilityScore {
  totalViolations: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  passCount: number;
  score: number;
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

export interface ElementCoordinate {
  x: number;
  y: number;
  width: number;
  height: number;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
}

export interface AuditRequest {
  url: string;
  useDesktop?: boolean;
  categories?: string[];
}

export interface PageMeta {
  title: string;
  description: string;
  keywords?: string[];
  language: string;
  charset?: string;
  viewport?: string;
  canonical: string;
}

export interface PageHeaders {
  h1: string;
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
}

export interface PageScreenshots {
  desktopUrl?: string;
  annotatedDesktopUrl?: string;
  annotatedMobileUrl?: string;
  mobileUrl?: string;
}

export interface SocialAnalysis {
  x: boolean;
  facebook: boolean;
  linkedin: boolean;
  instagram: boolean;
  tiktok: boolean;
  youtube: boolean;
  pinterest: boolean;
  missingSocials: string[];
}

export interface PageAccessibilityData {
  summary?: {
    score: number;
    totalViolations: number;
    passCount: number;
    criticalCount: number;
    seriousCount: number;
    moderateCount: number;
    minorCount: number;
  };
  violations?: Array<{
    id: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical';
    description: string;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: Array<{
      html: string;
      target: string[];
    }>;
  }>;
}

export interface PageData {
  url: string;
  pagePath: string;
  meta: PageMeta;
  isRobotsDoFollow: boolean;
  hasViewportMetaTag: boolean;
  canonical: string;
  ctas: string[];
  bodyText: string;
  textToHtmlRatio: number;
  headers: PageHeaders;
  hasSingleH1: boolean;
  screenshots: PageScreenshots[];
  wordCount?: number;
  socialAnalysis?: SocialAnalysis;
  accessibility?: {
    missingAltCount: number;
    totalImages: number;
    missingAltExamples: string[];
  };
  security?: {
    mixedContent: boolean;
  };
  brokenLinks?: string[];
  brokenLinkExamples?: string[];
  forms?: Array<{
    inputs: number;
    requiredFields: number;
    buttons: number;
  }>;
  issues?: {
    high: string[];
    medium: string[];
    low: string[];
  };
  suggestions?: string[];
  lighthouseDesktop?: ReducedLighthouseData;
  lighthouseMobile?: ReducedLighthouseData;
  accessibilityDesktop?: { violations: ReducedAccessibilityViolation[] };
  accessibilityMobile?: { violations: ReducedAccessibilityViolation[] };
}

export interface AuditResult {
  auditId: string;
  host: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  pages?: PageData[];
  error?: string;
}

// Only the fields to save for each violation
export interface ReducedAccessibilityViolation {
  description: string;
  help: string;
}

// Only the fields to save for Lighthouse
export interface ReducedLighthouseData {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  totalBlockingTime: number;
  speedIndex: number;
  interactionToNextPaint?: number;
}
