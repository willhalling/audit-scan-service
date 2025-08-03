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
      
      const prompt = this.buildAnalysisPrompt(pageData);
      
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
      console.log(`✅ AI analysis completed for ${pageData.url}`);
      
      return analysis;
    } catch (error) {
      console.error(`❌ AI analysis failed for ${pageData.url}:`, error);
      // Return dummy data on failure to not break the audit
      return this.getDummyAnalysis();
    }
  }

  private static buildAnalysisPrompt(pageData: PageData): string {
    return `Analyze this webpage content as a CRO specialist:

URL: ${pageData.url}
Meta Title: ${pageData.meta.title}
Meta Description: ${pageData.meta.description}
Main Heading (H1): ${pageData.headers.h1}
Call-to-Actions: ${pageData.ctas.join(', ')}
Content (first 1000 chars): ${pageData.bodyText}
Word Count: ${pageData.wordCount}

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
- For meta title suggestion: provide the actual improved title text (single line, max 60 characters)
- For meta description suggestion: provide the actual improved description text (single line, max 160 characters)
- For tone/readability/intent suggestions: provide detailed, comprehensive single-line actionable text improvements

FORMATTING RULES:
- All suggestions must be single line text only
- No bullet points, line breaks, or multi-line formatting
- No special characters or symbols
- Make suggestions detailed and comprehensive while keeping them on one line
- Do not include phrases like "Consider adding", "For example", or other explanatory text`;
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
        }
      },
      content: {
        tone: {
          analysis: "Content tone is professional and informative",
          suggestions: "Adopt a more conversational and personal tone that speaks directly to customer pain points and builds emotional connection"
        },
        readability: {
          analysis: "Content is generally readable but could be improved",
          suggestions: "Break up long paragraphs into shorter sentences and use simpler language to improve comprehension and engagement"
        },
        intent: {
          analysis: "Content aligns well with likely user intent",
          suggestions: "Address specific user concerns and provide clear next steps that guide visitors toward taking action"
        }
      }
    };
  }
}
