# MOZ API Service

This service integrates with the MOZ API to provide SEO metrics, keyword research, and competitor analysis for your Audit Scan Service. **MOZ data can be automatically saved to Firestore** as part of your audit workflow.

## Features

- ✅ **Domain Authority & Page Authority** - Get core MOZ metrics
- ✅ **Link Metrics** - Backlinks, linking domains, spam scores
- ✅ **Keyword Research** - Discover keyword opportunities and difficulty scores
- ✅ **Competitor Analysis** - Find and analyze competing domains
- ✅ **Rate Limiting** - Built-in respect for MOZ API limits
- ✅ **Enable/Disable Flag** - Easy on/off control
- ✅ **Comprehensive Analysis** - Combined metrics, keywords, and competitors
- ✅ **Firestore Integration** - Automatic saving to your audit database
- ✅ **Audit Enhancement** - Add MOZ data to existing auditsvice

This service integrates with the MOZ API to provide SEO metrics, keyword research, and competitor analysis for your Audit Scan Service.

## Features

- ✅ **Domain Authority & Page Authority** - Get core MOZ metrics
- ✅ **Link Metrics** - Backlinks, linking domains, spam scores
- ✅ **Keyword Research** - Discover keyword opportunities and difficulty scores
- ✅ **Competitor Analysis** - Find and analyze competing domains
- ✅ **Rate Limiting** - Built-in respect for MOZ API limits
- ✅ **Enable/Disable Flag** - Easy on/off control
- ✅ **Comprehensive Analysis** - Combined metrics, keywords, and competitors

## Setup

### 1. Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Enable MOZ API (required to activate the service)
MOZ_ENABLED=true

# MOZ API Credentials (get these from MOZ Pro dashboard)
MOZ_ACCESS_ID=your_moz_access_id_here
MOZ_SECRET_KEY=your_moz_secret_key_here
```

### 2. Getting MOZ API Credentials

1. Sign up for a [MOZ Pro account](https://moz.com/pro)
2. Go to your MOZ Pro dashboard
3. Navigate to "API Access" section
4. Generate your Access ID and Secret Key
5. Add them to your environment variables

**Note:** MOZ API credentials are currently placeholders. You'll need to obtain real credentials from MOZ to use this service.

## API Endpoints

### Basic Metrics

#### Get URL Metrics
```
GET /moz/metrics?url=example.com
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "domainAuthority": 85,
    "pageAuthority": 75,
    "spamScore": 2,
    "linkingDomains": 1250,
    "totalLinks": 45000,
    "mozRank": 7.2,
    "mozTrust": 6.8,
    "lastCrawled": "2025-08-01T10:30:00Z",
    "title": "Example Domain"
  },
  "timestamp": "2025-08-06T15:30:00Z"
}
```

#### Bulk URL Metrics
```
POST /moz/bulk-metrics
Content-Type: application/json

{
  "urls": ["example.com", "google.com", "github.com"]
}
```

### Keyword Research

#### Get Keyword Data
```
GET /moz/keywords?domain=example.com&keywords=seo,marketing,analytics
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "keyword": "seo tools",
      "difficulty": 65,
      "volume": 12000,
      "opportunity": 85,
      "potential": 92,
      "ctr": 3.2,
      "priority": 78
    }
  ],
  "count": 25,
  "domain": "example.com"
}
```

### Competitor Analysis

#### Get Competitor Data
```
GET /moz/competitors?domain=example.com&limit=10
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "url": "competitor1.com",
      "domainAuthority": 82,
      "pageAuthority": 70,
      "linkingDomains": 1100,
      "totalLinks": 38000,
      "commonKeywords": 145,
      "competitionLevel": "high"
    }
  ],
  "count": 10,
  "domain": "example.com"
}
```

### Comprehensive Analysis

#### Full MOZ Analysis
```
GET /moz/analysis?url=example.com&keywords=true&competitors=true&limit=5&keywordList=seo,marketing
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "example.com",
    "metrics": { /* basic metrics */ },
    "keywords": [ /* keyword data */ ],
    "competitors": [ /* competitor data */ ],
    "timestamp": "2025-08-06T15:30:00Z",
    "rateLimitRemaining": 450
  }
}
```

### Service Status

#### Check API Status
```
GET /moz/status
```

Response:
```json
{
  "enabled": true,
  "configured": true,
  "connected": true,
  "message": "MOZ API connection successful",
  "timestamp": "2025-08-06T15:30:00Z"
}
```

## Usage Examples

### JavaScript/Node.js
```javascript
// Basic metrics
const response = await fetch('/moz/metrics?url=example.com');
const data = await response.json();
console.log('Domain Authority:', data.data.domainAuthority);

// Full analysis
const analysis = await fetch('/moz/analysis?url=example.com&keywords=true&competitors=true');
const result = await analysis.json();
console.log('Analysis:', result.data);
```

### cURL
```bash
# Check status
curl http://localhost:8080/moz/status

# Get metrics
curl "http://localhost:8080/moz/metrics?url=example.com"

# Get keywords
curl "http://localhost:8080/moz/keywords?domain=example.com&keywords=seo,marketing"

# Full analysis
curl "http://localhost:8080/moz/analysis?url=example.com&keywords=true&competitors=true&limit=5"
```

## Firestore Integration

### Data Storage Format

MOZ data is saved to Firestore in two ways:

#### 1. Within Page Data (PageData.mozData)
```javascript
{
  url: "https://example.com",
  pagePath: "/",
  // ... other page data
  mozData: {
    url: "https://example.com",
    metrics: {
      domainAuthority: 85,
      pageAuthority: 75,
      spamScore: 2,
      linkingDomains: 1250,
      totalLinks: 45000,
      mozRank: 7.2,
      mozTrust: 6.8
    },
    keywords: [
      {
        keyword: "seo tools",
        difficulty: 65,
        volume: 12000,
        priority: 78
      }
    ],
    competitors: [
      {
        url: "competitor.com",
        domainAuthority: 82,
        competitionLevel: "high",
        commonKeywords: 145
      }
    ],
    timestamp: "2025-08-06T15:30:00Z",
    rateLimitRemaining: 450
  }
}
```

#### 2. Separate Collection (moz_analyses)
```javascript
// Document ID: auditId_base64EncodedUrl
{
  auditId: "audit_123",
  pageUrl: "https://example.com",
  url: "https://example.com",
  metrics: { /* MOZ metrics */ },
  keywords: [ /* keyword data */ ],
  competitors: [ /* competitor data */ ],
  timestamp: "2025-08-06T15:30:00Z",
  savedAt: 1691337000000
}
```

### Firestore API Endpoints

#### Analyze and Save to Firestore
```
POST /moz/analyze-and-save
Content-Type: application/json

{
  "url": "example.com",
  "auditId": "audit_123",
  "includeKeywords": true,
  "includeCompetitors": true,
  "keywords": ["seo", "marketing"],
  "competitorLimit": 10
}
```

#### Enhance Existing Audit
```
POST /moz/enhance-audit
Content-Type: application/json

{
  "auditId": "audit_123"
}
```

Response:
```json
{
  "success": true,
  "message": "Successfully enhanced 5/5 pages with MOZ data",
  "processedUrls": 5
}
```

#### Get Audit MOZ Summary
```
GET /moz/audit-summary/audit_123
```

Response:
```json
{
  "success": true,
  "data": {
    "totalPages": 5,
    "pagesWithMozData": 5,
    "averageDomainAuthority": 78,
    "averagePageAuthority": 65,
    "totalKeywords": 125,
    "totalCompetitors": 25,
    "topKeywords": [
      {
        "keyword": "seo tools",
        "difficulty": 65,
        "volume": 12000
      }
    ],
    "topCompetitors": [
      {
        "url": "competitor.com",
        "domainAuthority": 85,
        "competitionLevel": "high"
      }
    ]
  }
}
```

#### Get Saved MOZ Data
```
GET /moz/firestore/audit_123/example.com
```

### Integration Examples

#### Standalone Analysis with Firestore Save
```javascript
import { MozIntegrationService } from './src/services/moz-integration.service.js';

const result = await MozIntegrationService.analyzePage('example.com', {
  auditId: 'audit_123',
  saveToFirestore: true,
  includeKeywords: true,
  includeCompetitors: true
});
```

#### Enhance Existing Audit
```javascript
const result = await MozIntegrationService.enhanceAuditWithMozData('audit_123');
console.log(`Enhanced ${result.processedUrls} pages`);
```

#### Get MOZ Summary
```javascript
const summary = await MozIntegrationService.getAuditMozSummary('audit_123');
console.log(`Average DA: ${summary.averageDomainAuthority}`);
```

## Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MOZ_ENABLED` | Yes | `false` | Enable/disable MOZ API service |
| `MOZ_ACCESS_ID` | Yes* | - | MOZ API Access ID |
| `MOZ_SECRET_KEY` | Yes* | - | MOZ API Secret Key |

*Required only when `MOZ_ENABLED=true`

### Rate Limiting

The service includes built-in rate limiting to respect MOZ API limits:

- **Default delay**: 1 second between requests
- **Automatic parsing**: Rate limit headers from MOZ API
- **Batch processing**: Smart batching for bulk requests
- **Graceful degradation**: Continues operation with errors

## Integration with Audit Process

The MOZ service is designed to integrate seamlessly with your existing audit workflow:

### Standalone Usage
```javascript
import { MozService } from './src/services/moz.service.js';

// Check if enabled
if (MozService.isEnabled()) {
  const metrics = await MozService.getUrlMetrics('example.com');
  console.log('DA:', metrics.domainAuthority);
}
```

### Integrated with Audits
```javascript
// In your audit service
const auditData = {
  lighthouse: await getLighthouseData(url),
  screenshot: await getScreenshot(url),
  moz: MozService.isEnabled() ? await MozService.getFullAnalysis(url) : null
};
```

## Testing

Run the included test file to verify your setup:

```bash
# Build the project
npm run build

# Run MOZ service tests
node dist/test-moz.js
```

The test will check:
- ✅ Service enabled status
- ✅ API configuration
- ✅ Connectivity
- ✅ Basic metrics
- ✅ Keyword research
- ✅ Competitor analysis
- ✅ Full analysis
- ✅ Bulk operations

## Error Handling

The service includes comprehensive error handling:

```javascript
{
  "url": "example.com",
  "domainAuthority": 0,
  "pageAuthority": 0,
  "spamScore": 0,
  "linkingDomains": 0,
  "totalLinks": 0,
  "mozRank": 0,
  "mozTrust": 0,
  "error": "MOZ API Error: 401 - Unauthorized"
}
```

Common error scenarios:
- **Service disabled**: Returns placeholder data with error message
- **API credentials missing**: Clear error message with setup instructions
- **Rate limit exceeded**: Automatic delays and retries
- **Invalid URLs**: Validation and normalization
- **Network errors**: Graceful fallback with error details

## Security

- **Environment variables**: Credentials stored securely in environment
- **API key rotation**: Easy credential updates without code changes
- **Request signing**: HMAC-SHA1 authentication as per MOZ requirements
- **HTTPS only**: All API requests use secure connections

## Limitations

- **MOZ API quotas**: Respects your MOZ Pro plan limits
- **Rate limiting**: Built-in delays to prevent quota exhaustion
- **Batch size**: Maximum 50 URLs per bulk request
- **Competitor limit**: Maximum 50 competitors per request
- **Keyword limit**: Maximum 50 keywords per request

## Troubleshooting

### Common Issues

1. **"MOZ API is disabled"**
   - Set `MOZ_ENABLED=true` in your environment

2. **"MOZ API credentials not configured"**
   - Set `MOZ_ACCESS_ID` and `MOZ_SECRET_KEY`

3. **"MOZ API Error: 401 - Unauthorized"**
   - Check your MOZ API credentials
   - Verify your MOZ Pro subscription is active

4. **"Rate limit exceeded"**
   - Wait for rate limit reset
   - Consider upgrading your MOZ Pro plan

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=moz:*
```

## Support

For MOZ API specific issues:
- [MOZ API Documentation](https://moz.com/help/guides/moz-api)
- [MOZ Pro Support](https://moz.com/help)

For integration issues with this service:
- Check the test file output for diagnostics
- Review error messages in the API responses
- Verify environment variable setup
