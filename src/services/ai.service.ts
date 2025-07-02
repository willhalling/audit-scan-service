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
    if (!enableAI) {
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
    "heading": {
      "analysis": "Analysis of H1 heading effectiveness",
      "suggestion": "Specific suggestion"
    },
    "cta": {
      "analysis": "Analysis of call-to-action effectiveness",
      "suggestion": "Specific suggestion"
    },
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

Be specific and actionable in suggestions.`;
  }

  private static getDummyAnalysis(): AIAnalysis {
    return {
      meta: {
        title: {
          analysis: "Meta title appears to be optimized for search engines with relevant keywords",
          suggestions: "Consider adding emotional triggers"
        },
        description: {
          analysis: "Meta description provides good overview but could be more compelling",
          suggestions: "Add call-to-action in description"
        }
      },
      content: {
        heading: {
          analysis: "H1 heading is clear but could be more benefit-focused",
          suggestions: "Lead with primary benefit"
        },
        cta: {
          analysis: "Call-to-actions are present but could be more compelling",
          suggestions: "Use action-oriented language"
        },
        tone: {
          analysis: "Content tone is professional and informative",
          suggestions: "Add more personality"
        },
        readability: {
          analysis: "Content is generally readable but could be improved",
          suggestions: "Use shorter sentences"
        },
        intent: {
          analysis: "Content aligns well with likely user intent",
          suggestions: "Address common objections"
        }
      }
    };
  }
}
