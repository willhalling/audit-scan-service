export const MAX_PAGES = 5;

export const EXCLUDED_LINKS = [
  'cdn-cgi', 'tel:', 'request_format~json', 'get-started-risk-free', 
  'mailto:', 'ms-windows-store', 'linkedin', 'javascript: void(0)', 
  'twitter', 'redirect'
];

export const EXCLUDED_PAGES = [
  'cdn-cgi', 'sign-in', 'login', 'log-in', 'register', 'sign-up', 
  'signup', 'privacy', 'cookie', 'terms', 'cart', 'checkout', 
  'mailto:', 'customer_authentication', 'redirect'
];

export const CTAS = [
  'buy', 'subscribe', 'sign up', 'get started', 'learn more', 'join', 
  'with us', 'get in touch', 'our services', 'contact us', 'download', 
  'free trial', 'register', 'book now', 'order now', 'shop now', 
  'view more', 'read more', 'discover', 'explore', 'watch now', 
  'try now', 'apply now', 'donate', 'support', 'reserve', 'schedule', 
  'find out more', 'get quote', 'request demo', 'start free trial', 
  'claim offer', 'see plans', 'view pricing', 'get discount', 
  'limited time offer', 'sign in', 'log in', 'create account', 
  'join now', 'become a member', 'upgrade', 'renew', 'activate', 
  'start now', 'enroll', 'get access', 'view details', 'see more', 
  'continue', 'proceed', 'next', 'back', 'finish', 'complete', 
  'submit', 'send', 'contact', 'follow us', 'like us', 'share', 
  'tweet', 'pin it', 'connect', 'join the conversation', 
  'join the community', 'join the club',

   // Ecommerce / Retail
  'add to cart', 'checkout', 'buy now', 'shop now', 'view deal', 'save now',
  'claim offer', 'grab deal', 'see offer', 'lock in', 'get deal',

  // SaaS / B2B
  'start free', 'get demo', 'book demo', 'talk sales', 'view demo', 'view case',
  'get started free', 'start free trial', 'try free',

  // Lead Gen / Content
  'download now', 'get ebook', 'free download', 'read more', 'view guide',
  'read guide', 'get checklist', 'get template', 'get report',

  // Community / Social
  'follow us', 'join us', 'join now', 'join free', 'become member',
  'follow along', 'stay updated', 'join community', 'join newsletter',
  'sign me up'
];

export const IMPACT_COLORS = {
  critical: '#dc2626',
  serious: '#ea580c',
  moderate: '#d97706',
  minor: '#65a30d',
  default: '#6b7280'
} as const;
