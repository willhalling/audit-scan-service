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
  violations?: Array<{
    issue: string;
    suggestion: string;
    severity: 'critical' | 'serious' | 'moderate' | 'minor';
  }>;
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
  wordCount: number;
  forms: FormInfo[];
  socialLinks: SocialPlatforms;
  brokenLinks: {
    broken: string[];
    valid: string[];
    brokenExamples: string[];
  };
  pageCount: number;
  contentAnalysis: ContentAnalysis;
  wordCloudData: WordCloudData[];
}

export interface WordCloudData {
  text: string;
  size: number;
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

export interface CTAStyleData {
  text: string;
  selector: string;
  styles: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontWeight: string;
    padding: string;
    margin: string;
    borderRadius: string;
    border: string;
    width: string;
    height: string;
    position: string;
    zIndex: string;
  };
  dimensions: {
    width: number;
    height: number;
  };
  position: {
    x: number;
    y: number;
  };
  isVisible: boolean;
  contrastRatio?: number;
  accessibilityScore?: 'AA' | 'AAA' | 'Fail';
}

export interface CTAAnalysisResult {
  totalCTAs: number;
  analyzedCTAs: CTAStyleData[];
  skippedCount: number;
  averageSize: {
    width: number;
    height: number;
  };
  colorAnalysis: {
    uniqueBackgroundColors: string[];
    uniqueTextColors: string[];
    hasGoodContrast: boolean;
    contrastIssues: number;
  };
  sizingAnalysis: {
    tooSmall: number;
    optimal: number;
    tooLarge: number;
  };
  positioningAnalysis: {
    aboveFold: number;
    belowFold: number;
    fixed: number;
  };
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

export interface AIAnalysisSection {
  analysis: string;
  suggestions: string;
}

export interface AIAnalysis {
  meta: {
    title: AIAnalysisSection;
    description: AIAnalysisSection;
    keywords?: string[];
  };
  content: {
    heading?: AIAnalysisSection;
    cta?: AIAnalysisSection;
    tone: AIAnalysisSection;
    readability: AIAnalysisSection;
    intent: AIAnalysisSection;
  };
}

export interface AuditRequest {
  url: string;
  pages?: string[]; // Array of up to 5 page paths (e.g. ['/about', '/contact'])
  authorUid?: string; // Optional author UID to associate with the audit
  enableAI?: boolean; // Optional flag to enable/disable AI analysis (default: true)
  enableCTAAnalysis?: boolean; // Optional flag to enable/disable CTA visual analysis (default: true)
  maxCTAsToAnalyze?: number; // Optional limit for CTA analysis performance (default: 3)
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

export interface HeaderStructureAnalysis {
  hasLogicalOrder: boolean;
  structureIssues: string[];
  headerCount: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
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
  headerStructure: HeaderStructureAnalysis;
  hasSingleH1: boolean;
  screenshots: PageScreenshots;
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
    hasEmailField?: boolean;
    hasPhoneField?: boolean;
    hasNameField?: boolean;
  }>;
  trustSignals?: {
    hasSSLIndicators: boolean;
    hasPaymentLogos: boolean;
    hasSecurityBadges: boolean;
    hasTestimonials: boolean;
    hasReviews: boolean;
    hasPrivacyPolicy: boolean;
    hasRefundPolicy: boolean;
  };
  analyticsTracking?: {
    hasGoogleAnalytics: boolean;
    hasGTM: boolean;
    hasFacebookPixel: boolean;
    hasHotjar: boolean;
    hasOtherTracking: boolean;
  };
  issues?: Array<{
    issue: string;
    suggestion: string;
    severity: 'critical' | 'serious' | 'moderate' | 'minor';
  }>;
  suggestions?: Array<{
    issue: string;
    suggestion: string;
    severity: 'critical' | 'serious' | 'moderate' | 'minor';
  }>;
  mozData?: MozAnalysisResult;
  lighthouseDesktop?: ReducedLighthouseData;
  lighthouseMobile?: ReducedLighthouseData;
  accessibilityDesktop?: { violations: ReducedAccessibilityViolation[] };
  accessibilityMobile?: { violations: ReducedAccessibilityViolation[] };
  ctaAnalysis?: CTAAnalysisResult;
  wordCloudData?: WordCloudData[];
  ai?: AIAnalysis;
  conversionOptimization?: ConversionOptimizationAnalysis;
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
  authorUid?: string; // Optional author UID associated with the audit
}

// Only the fields to save for each violation
export interface ReducedAccessibilityViolation {
  id: string;
  issue: string;
  suggestion: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  isVisual: boolean; // Whether this violation appears in annotations
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
  violations?: Array<{
    issue: string;
    suggestion: string;
    severity: 'critical' | 'serious' | 'moderate' | 'minor';
  }>;
}

export interface MozMetrics {
  url: string;
  domainAuthority: number;
  pageAuthority: number;
  spamScore: number;
  linkingDomains: number;
  totalLinks: number;
  mozRank: number;
  mozTrust: number;
  lastCrawled?: string | undefined;
  title?: string | undefined;
  error?: string;
}

export interface MozKeywordData {
  keyword: string;
  difficulty: number;
  volume: number;
  opportunity: number;
  potential: number;
  ctr: number;
  priority: number;
  relevance?: number;
}

export interface MozCompetitorData {
  url: string;
  domainAuthority: number;
  pageAuthority: number;
  linkingDomains: number;
  totalLinks: number;
  commonKeywords?: number;
  competitionLevel?: 'low' | 'medium' | 'high';
}

export interface MozAnalysisResult {
  url: string;
  metrics: MozMetrics;
  keywords?: MozKeywordData[];
  competitors?: MozCompetitorData[];
  timestamp: string;
  rateLimitRemaining?: number | undefined;
  error?: string;
}

export interface QuestionItem {
  question: string;
  assessment: string;
  recommendation: string;
}

export interface ConversionOptimizationAnalysis {
  landingPageBasics?: QuestionItem[];
  callsToAction?: QuestionItem[];
  salesCopyMessaging?: QuestionItem[];
  trustCredibility?: QuestionItem[];
  testingAnalytics?: QuestionItem[];
  funnelFlow?: QuestionItem[];
}
