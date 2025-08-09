import OpenAI from 'openai';
import { AIAnalysis, PageData } from '../types/index.js';

export class AIService {
  private static openai: OpenAI | null = null;
  private static readonly MODEL = 'gpt-4'; // Easy to change

  private static getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }

      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  static async analyzePage(pageData: PageData, enableAI: boolean = true): Promise<AIAnalysis> {
    // Debug logs for enableAI
    console.log('🔍 AI Service enableAI value:', enableAI);
    console.log('🔍 AI Service enableAI type:', typeof enableAI);
    
    if (!enableAI) {
      console.log('🚫 AI disabled - returning dummy analysis');
      return this.getDummyAnalysis();
    }

    try {
      const openai = this.getOpenAI();
      
      // Generate keywords first
      const keywords = await this.generateKeywords(pageData, enableAI);
      
      const prompt = this.buildAnalysisPrompt(pageData, keywords);
      
      console.log(`🤖 Running AI analysis for ${pageData.url}`);
      
      const response = await openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a senior Conversion Rate Optimization (CRO) specialist and content strategist. Analyze the provided webpage content and provide specific, actionable suggestions for improvement. Return your response as valid JSON only, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      const analysis = JSON.parse(aiResponse);
      
      // Add keywords to the meta object
      analysis.meta.keywords = keywords;
      
      console.log(`✅ AI analysis completed for ${pageData.url}`);
      
      return analysis;
    } catch (error) {
      console.error(`❌ AI analysis failed for ${pageData.url}:`, error);
      // Return dummy data on failure to not break the audit
      return this.getDummyAnalysis();
    }
  }

  static async generateKeywords(pageData: PageData, enableAI: boolean = true): Promise<string[]> {
    if (!enableAI) {
      console.log('🚫 AI disabled - returning dummy keywords');
      return ['digital marketing', 'web design', 'online business'];
    }

    try {
      const openai = this.getOpenAI();
      
      const prompt = `Analyze this webpage content and identify the 3 most relevant broad keyword phrases for SEO:

URL: ${pageData.url}
Meta Title: ${pageData.meta.title}
Meta Description: ${pageData.meta.description}
Main Heading (H1): ${pageData.headers.h1}
Content (first 1000 chars): ${pageData.bodyText}

Based on this content, generate exactly 3 broad keyword phrases that best represent what this business/website is about.

Requirements:
- Focus on broad industry keywords (2-3 words each)
- Avoid very specific long-tail keywords
- Choose keywords that represent the main business/service focus
- Return as a simple JSON array of 3 strings only

Example format: ["funeral services", "memorial planning", "grief support"]`;
      
      console.log(`🔑 Generating keywords for ${pageData.url}`);
      
      const response = await openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an SEO keyword expert. Analyze website content and return exactly 3 broad keyword phrases as a JSON array. Return only valid JSON, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      const keywords = JSON.parse(aiResponse);
      console.log(`✅ Generated keywords: ${keywords.join(', ')}`);
      
      return keywords;
    } catch (error) {
      console.error(`❌ Keyword generation failed for ${pageData.url}:`, error);
      return ['digital marketing', 'web design', 'online business'];
    }
  }

  private static buildAnalysisPrompt(pageData: PageData, keywords: string[]): string {
    return `Analyze this webpage content as a CRO specialist:

URL: ${pageData.url}
Meta Title: ${pageData.meta.title}
Meta Description: ${pageData.meta.description}
Main Heading (H1): ${pageData.headers.h1}
Call-to-Actions: ${pageData.ctas.join(', ')}
Content (first 1000 chars): ${pageData.bodyText}
Word Count: ${pageData.wordCount}

AI-Generated Keywords: ${keywords.join(', ')}

Provide analysis and suggestions in this exact JSON structure:
{
  "meta": {
    "title": {
      "analysis": "Current analysis of meta title",
      "suggestion": "Specific suggestion"
    },
    "description": {
      "analysis": "Current analysis of meta description", 
      "suggestion": "Specific suggestion"
    }
  },
  "content": {
    "tone": {
      "analysis": "Analysis of content tone and voice",
      "suggestion": "Specific suggestion"
    },
    "readability": {
      "analysis": "Analysis of content readability level",
      "suggestion": "Specific suggestion"
    },
    "intent": {
      "analysis": "Analysis of how well content matches user intent",
      "suggestion": "Specific suggestion"
    }
  }
}

IMPORTANT: For suggestions, provide the actual improved text/content directly, not explanatory text.
- For meta title suggestion: provide the actual improved title text incorporating one AI-generated keyword naturally (single line, max 60 characters)
- For meta description suggestion: provide the actual improved description text incorporating one AI-generated keyword naturally (single line, max 160 characters)
- For tone/readability/intent suggestions: provide general guidance on how to improve rather than specific text changes (single line)

FORMATTING RULES:
- All suggestions must be single line text only
- No bullet points, line breaks, or multi-line formatting
- No special characters or symbols
- Make suggestions detailed and comprehensive while keeping them on one line
- Do not include phrases like "Consider adding", "For example", or other explanatory text
- Naturally incorporate the provided AI-generated keywords into meta suggestions without keyword stuffing`;
  }

  private static getDummyAnalysis(): AIAnalysis {
    return {
      meta: {
        title: {
          analysis: "Meta title appears to be optimized for search engines with relevant keywords",
          suggestions: "Boost Local SEO Rankings with Expert Digital Marketing"
        },
        description: {
          analysis: "Meta description provides good overview but could be more compelling",
          suggestions: "Get more customers with proven digital marketing strategies that increase online visibility and drive real business results"
        },
        keywords: ['digital marketing', 'web design', 'online business']
      },
      content: {
        tone: {
          analysis: "Content tone is professional and informative",
          suggestions: "Use more conversational language that directly addresses customer pain points"
        },
        readability: {
          analysis: "Content is generally readable but could be improved",
          suggestions: "Simplify language and break up long paragraphs for better comprehension"
        },
        intent: {
          analysis: "Content aligns well with likely user intent",
          suggestions: "Address specific user concerns and provide clearer next steps"
        }
      }
    };
  }
}
