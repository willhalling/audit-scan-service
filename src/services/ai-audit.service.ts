import OpenAI from 'openai';
import { AiReport, ScanPackage } from '../types/index.js';

const MODEL = 'gpt-4o';

const AI_REPORT_SCHEMA = {
  name: 'ai_report',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'score',
      'summary',
      'firstImpression',
      'categories',
      'strengths',
      'improvements',
      'quickWins'
    ],
    properties: {
      score: { type: 'number', description: 'Overall score 0-100' },
      summary: { type: 'string', description: '2-3 sentence consultant summary of the website' },
      firstImpression: { type: 'string', description: 'What a first-time mobile visitor experiences in the first 5 seconds' },
      categories: {
        type: 'object',
        additionalProperties: false,
        required: ['trust', 'mobile', 'enquiries', 'appearance', 'content'],
        properties: {
          trust: { $ref: '#/$defs/category' },
          mobile: { $ref: '#/$defs/category' },
          enquiries: { $ref: '#/$defs/category' },
          appearance: { $ref: '#/$defs/category' },
          content: { $ref: '#/$defs/category' }
        }
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Things the website already does well'
      },
      improvements: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'why', 'recommendation', 'impact'],
          properties: {
            title: { type: 'string' },
            why: { type: 'string', description: 'Why this matters for winning enquiries' },
            recommendation: { type: 'string', description: 'Concrete, practical fix' },
            impact: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      },
      quickWins: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fast fixes the owner could make this week'
      }
    },
    $defs: {
      category: {
        type: 'object',
        additionalProperties: false,
        required: ['score', 'verdict'],
        properties: {
          score: { type: 'number', description: '0-100' },
          verdict: { type: 'string', description: 'One or two sentences, consultant tone' }
        }
      }
    }
  }
} as const;

const SYSTEM_PROMPT = `You are a senior UX/CRO consultant who specialises in websites for local
service businesses (trades, clinics, salons, restaurants, professional services).
You are reviewing a business's website MOBILE-FIRST, because that is where most
of their customers will see it.

Judge the site on what actually wins enquiries:
- The 5-second test: is it immediately obvious what the business does, where it
  is, and who it serves?
- Trust: reviews, ratings, guarantees, accreditations, real photos, credentials.
- Contactability: can a visitor call, message, WhatsApp or book within seconds?
- Clear CTA: is there an obvious next step above the fold on mobile?
- Modern feel: does the design look current and professional, or dated?
- Mobile scannability: headings, spacing, font sizes, tap targets, page length.

Write like a personalised consultant's report for the business owner — direct,
specific, practical. Reference what is actually on the page (real headings,
CTA text, phone numbers you can see). Do NOT produce an SEO checklist. Every
improvement must tie back to winning an enquiry. Prioritise improvements by
enquiry impact.`;

/**
 * Generate the consultant-style AI report from the screenshots (vision) plus
 * the trimmed scan package. Throws on failure — callers should catch, log and
 * let the audit complete without an aiReport.
 */
export class AiAuditService {
  static async generate(
    scan: ScanPackage,
    screenshots: { mobileFoldUrl?: string; mobileFullUrl?: string; desktopFoldUrl?: string }
  ): Promise<AiReport> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const client = new OpenAI({ apiKey, timeout: 120000 });

    const imageUrls = unique([
      screenshots.mobileFoldUrl,
      screenshots.mobileFullUrl,
      screenshots.desktopFoldUrl
    ]);

    console.log(`🤖 Generating AI report (${imageUrls.length} screenshot(s), model ${MODEL})...`);

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text:
          `Review this local-business website: ${scan.website.finalUrl}\n\n` +
          `Attached: mobile above-fold screenshot first, then the full mobile page` +
          `${screenshots.desktopFoldUrl ? ', then the desktop above-fold' : ''}.\n\n` +
          `Here is the structured scan data extracted from the live site:\n` +
          '```json\n' +
          JSON.stringify(scan) +
          '\n```'
      },
      ...imageUrls.map((url) => ({
        type: 'image_url' as const,
        image_url: { url, detail: 'high' as const }
      }))
    ];

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: AI_REPORT_SCHEMA
      }
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('OpenAI returned an empty response');
    }

    const parsed = JSON.parse(raw);
    console.log(`✅ AI report generated (score: ${parsed.score})`);

    return {
      ...parsed,
      model: MODEL,
      generatedAt: new Date().toISOString()
    } as AiReport;
  }
}

function unique(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}
