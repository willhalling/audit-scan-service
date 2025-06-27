import UserAgent from 'user-agents';

export const generateRandomUserAgent = (): string => {
  return new UserAgent({ deviceCategory: 'desktop' }).toString();
};

export const generateHeaders = () => ({
  'User-Agent': generateRandomUserAgent(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
  'DNT': '1',
  'Referer': 'https://www.google.com',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
});

export const getImpactColor = (impact: string): string => {
  switch (impact) {
    case 'critical': return '#dc2626';
    case 'serious': return '#ea580c';
    case 'moderate': return '#d97706';
    case 'minor': return '#65a30d';
    default: return '#6b7280';
  }
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const normalizeUrl = (url: string): string => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
};
