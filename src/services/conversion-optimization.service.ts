import OpenAI from 'openai';
import { ConversionOptimizationAnalysis, PageData, QuestionItem, CTAAnalysisResult } from '../types/index.js';

export class ConversionOptimizationService {
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

  static async analyzePageForConversion(pageData: PageData, enableAI: boolean = true): Promise<ConversionOptimizationAnalysis> {
    console.log('🔄 Conversion Optimization Service enableAI value:', enableAI);
    
    if (!enableAI) {
      console.log('🚫 Conversion optimization analysis disabled - returning empty analysis');
      return {};
    }

    try {
      const openai = this.getOpenAI();
      
      const prompt = this.buildConversionAnalysisPrompt(pageData);
      
      console.log(`🎯 Running conversion optimization analysis for ${pageData.url}`);
      
      const response = await openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a senior Conversion Rate Optimization (CRO) specialist with expertise in landing page optimization, user experience, and conversion psychology. Analyze the provided webpage data and answer specific questions about conversion optimization best practices.

Return your response as valid JSON only, no additional text. For each category, provide an array of QuestionItem objects with question, assessment, and recommendation fields.

If you cannot determine an answer from the available data, leave that category as an empty array.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      const analysis = JSON.parse(aiResponse);
      console.log(`✅ Conversion optimization analysis completed for ${pageData.url}`);
      
      return analysis;
    } catch (error) {
      console.error(`❌ Conversion optimization analysis failed for ${pageData.url}:`, error);
      // Return empty data on failure to not break the audit
      return {};
    }
  }

  private static buildConversionAnalysisPrompt(pageData: PageData): string {
    const accessibilityIssues = this.summarizeAccessibilityIssues(pageData);
    const performanceIssues = this.summarizePerformanceIssues(pageData);
    const goalAnalysis = this.analyzePageGoal(pageData);
    const copyAnalysis = this.analyzeSalesCopy(pageData);
    
    return `You are a senior CRO specialist. Analyze this webpage data and provide SPECIFIC, DATA-DRIVEN insights with concrete recommendations based on the actual content and metrics provided.

**PAGE INFORMATION:**
URL: ${pageData.url}
Page Path: ${pageData.pagePath}
Page Title: ${pageData.meta.title}
Meta Description: ${pageData.meta.description}
Main Heading (H1): ${pageData.headers.h1}
Has Single H1: ${pageData.hasSingleH1}

**COMPLETE HEADER STRUCTURE:**
H1: ${pageData.headers.h1}
H2s: ${pageData.headers.h2.length > 0 ? pageData.headers.h2.join(' | ') : 'None'}
H3s: ${pageData.headers.h3.length > 0 ? pageData.headers.h3.join(' | ') : 'None'}
Header Structure Analysis:
- Logical Order: ${pageData.headerStructure.hasLogicalOrder ? 'Yes' : 'No'}
- Header Counts: H1:${pageData.headerStructure.headerCount.h1}, H2:${pageData.headerStructure.headerCount.h2}, H3:${pageData.headerStructure.headerCount.h3}
- Issues: ${pageData.headerStructure.structureIssues.length > 0 ? pageData.headerStructure.structureIssues.join(', ') : 'None'}

**DETAILED CONTENT ANALYSIS:**
Word Count: ${pageData.wordCount || 'Unknown'}
Text to HTML Ratio: ${pageData.textToHtmlRatio}
Full Body Text: ${pageData.bodyText}

**SALES COPY ANALYSIS:**
${copyAnalysis}

**PAGE GOAL ANALYSIS:**
${goalAnalysis}

**CALLS TO ACTION (DETAILED):**
CTAs Found: ${pageData.ctas.length > 0 ? pageData.ctas.join(', ') : 'None identified'}
CTA Count: ${pageData.ctas.length}
CTA Analysis: ${this.analyzeCTAs(pageData.ctas)}
CTA Visual Analysis: ${pageData.ctaAnalysis ? this.summarizeCTAVisualData(pageData.ctaAnalysis) : 'Visual analysis not available'}

**FORMS ANALYSIS:**
${pageData.forms && pageData.forms.length > 0 
  ? pageData.forms.map((form, i) => `Form ${i + 1}: ${form.inputs} inputs, ${form.requiredFields} required, ${form.buttons} buttons${form.hasEmailField ? ', has email field' : ''}${form.hasPhoneField ? ', has phone field' : ''}${form.hasNameField ? ', has name field' : ''}`).join('\n')
  : 'No forms found'}

**TRUST SIGNALS (DETAILED):**
${pageData.trustSignals ? `
SSL Indicators: ${pageData.trustSignals.hasSSLIndicators ? 'Yes' : 'No'}
Payment Logos: ${pageData.trustSignals.hasPaymentLogos ? 'Yes' : 'No'}
Security Badges: ${pageData.trustSignals.hasSecurityBadges ? 'Yes' : 'No'}
Testimonials: ${pageData.trustSignals.hasTestimonials ? 'Yes' : 'No'}
Reviews: ${pageData.trustSignals.hasReviews ? 'Yes' : 'No'}
Privacy Policy: ${pageData.trustSignals.hasPrivacyPolicy ? 'Yes' : 'No'}
Refund Policy: ${pageData.trustSignals.hasRefundPolicy ? 'Yes' : 'No'}` : 'Trust signals not analyzed'}

**ANALYTICS & TRACKING:**
${pageData.analyticsTracking ? `
Google Analytics: ${pageData.analyticsTracking.hasGoogleAnalytics ? 'Yes' : 'No'}
Google Tag Manager: ${pageData.analyticsTracking.hasGTM ? 'Yes' : 'No'}
Facebook Pixel: ${pageData.analyticsTracking.hasFacebookPixel ? 'Yes' : 'No'}
Hotjar: ${pageData.analyticsTracking.hasHotjar ? 'Yes' : 'No'}
Other Tracking: ${pageData.analyticsTracking.hasOtherTracking ? 'Yes' : 'No'}` : 'Analytics tracking not analyzed'}

**SOCIAL PROOF & TRUST SIGNALS:**
Social Media Presence: ${pageData.socialAnalysis ? Object.entries(pageData.socialAnalysis)
  .filter(([key, value]) => key !== 'missingSocials' && value === true)
  .map(([key]) => key).join(', ') || 'None found' : 'Not analyzed'}

**TECHNICAL PERFORMANCE (SPECIFIC METRICS):**
${performanceIssues}

**ACCESSIBILITY ISSUES (SPECIFIC):**
${accessibilityIssues}

**SECURITY:**
Mixed Content Issues: ${pageData.security?.mixedContent ? 'Yes' : 'No'}
Canonical URL: ${pageData.canonical || 'Not set'}

Please analyze this data and provide SPECIFIC, DATA-DRIVEN conversion optimization insights for ALL categories. Use the actual content, metrics, and data provided to give concrete recommendations.

INSTRUCTIONS FOR ALL CATEGORIES:

1. **Landing Page Basics**: 
   - Use the Goal Analysis data provided above
   - Analyze the actual H1: "${pageData.headers.h1}"
   - Use the Header Structure Analysis provided above
   - Use the ACTUAL performance metrics provided above

2. **Calls to Action**:
   - ANALYZE the CTA Analysis data provided above with categorization
   - USE the CTA Visual Analysis data when available for size, color, and contrast insights
   - EVALUATE CTA strength based on action words, value propositions, and specificity
   - ASSESS CTA frequency, placement, and clarity
   - IDENTIFY weak patterns and suggest specific improvements with examples
   - COMPARE current CTAs to high-converting alternatives

3. **Sales Copy & Messaging**:
   - Analyze the H1 "${pageData.headers.h1}", H2s, meta description, and body text
   - IDENTIFY benefits vs features automatically from the content
   - DETECT objection-handling language and identify gaps
   - ASSESS readability and clarity of messaging, avoiding jargon
   - EVALUATE social proof presence including testimonials, reviews, success stories

4. **Trust & Credibility**:
   - Use the Trust Signals data provided above
   - Reference actual form analysis data
   - Use security and SSL information

5. **Testing & Analytics**:
   - Use the Analytics & Tracking data provided above
   - Reference actual tracking implementations found

6. **Funnel Flow**:
   - Analyze based on page goal and content structure
   - Use performance data for checkout recommendations

Return the complete analysis in this JSON format:

{
  "landingPageBasics": [
    {
      "question": "Does the page have one clear, primary goal (such as purchase, sign-up, or booking)?",
      "assessment": "Based on the goal analysis: [specific analysis using the actual goal analysis data]",
      "recommendation": "Specific recommendation based on the actual content and CTAs found"
    },
    {
      "question": "Does the headline directly address a pain point or desire of the visitor?",
      "assessment": "The current H1 '[actual H1]' does/doesn't address pain points because [specific analysis]",
      "recommendation": "Rewrite the headline to: '[specific headline suggestion based on content]' or '[alternative suggestion]'"
    },
    {
      "question": "Is the page structure logical and easy to scan?",
      "assessment": "Header structure analysis shows: [reference pageData.headerStructure.hasLogicalOrder and pageData.headerStructure.structureIssues]",
      "recommendation": "Specific structural improvements based on actual header analysis"
    },
    {
      "question": "Is the mobile version fast, clean, and fully functional?",
      "assessment": "Mobile performance is [score]/100 with LCP: [actual value, rounded]ms, CLS: [actual value, rounded to 3 decimal places], and [number] accessibility violations",
      "recommendation": "Improve mobile performance by: [specific recommendations based on actual metrics]"
    }
  ],
  "callsToAction": [
    {
      "question": "Are the CTA buttons action-focused and specific (for example, \"Get My Free Trial\")?",
      "assessment": "ANALYZE each CTA for action words, value propositions, and specificity. CATEGORIZE as strong, generic, or weak. Current CTAs: [list with categorization]",
      "recommendation": "Replace weak CTAs with strong alternatives. Examples: Instead of 'Learn More' → 'Get Your Free Marketing Audit', Instead of 'Submit' → 'Get My Custom Quote', Instead of 'Click Here' → 'Download Free Guide Now'"
    },
    {
      "question": "Do the CTA buttons stand out visually in terms of size, color, and contrast?",
      "assessment": "ANALYZE CTA visual data: [reference actual visual analysis data including sizes, colors, contrast ratios, and accessibility scores]. EVALUATE visual prominence and accessibility compliance.",
      "recommendation": "Specific visual improvement recommendations based on actual color/contrast data and sizing analysis"
    },
    {
      "question": "Do CTAs appear multiple times on longer pages?",
      "assessment": "ANALYZE CTA frequency: Found [number] CTAs. EVALUATE if this is appropriate for page length and content structure.",
      "recommendation": "Optimal CTA placement strategy: Above fold, mid-content, and bottom placement with examples like 'Start Free Trial' at top, 'See Pricing' mid-page, 'Get Started Today' at bottom"
    },
    {
      "question": "Does the CTA language clearly explain what happens after clicking?",
      "assessment": "EXAMINE each CTA for clarity about next steps: [analyze actual CTA language for clarity and expectation setting]",
      "recommendation": "Improve CTA clarity with specific examples: 'Download Guide' → 'Download Free 10-Page SEO Guide', 'Contact Us' → 'Get Your Free 30-Minute Consultation', 'Sign Up' → 'Start Your 14-Day Free Trial'"
    }
  ],
  "salesCopyMessaging": [
    {
      "question": "Does the copy focus on benefits and outcomes for the user, rather than just features?",
      "assessment": "ANALYZE the H1 '${pageData.headers.h1}', H2s, meta description, and body content. IDENTIFY specific benefits vs features mentioned. COUNT the ratio.",
      "recommendation": "Specific recommendations to transform features into benefits based on actual content analysis"
    },
    {
      "question": "Are common objections (such as pricing, trust, or usability) addressed?",
      "assessment": "SCAN the content for objection-handling language. IDENTIFY what objections are addressed and which are missing.",
      "recommendation": "Specific objection handling improvements based on content gaps found"
    },
    {
      "question": "Is the copy clear and simple, avoiding jargon?",
      "assessment": "EVALUATE readability of H1, H2s, meta description, and body text. IDENTIFY jargon, complex sentences, or unclear messaging.",
      "recommendation": "Specific clarity improvements with suggested rewrites"
    },
    {
      "question": "Is there social proof present, such as testimonials, reviews, or success stories?",
      "assessment": "DETECT social proof elements in the content: testimonials, reviews, case studies, success stories, customer logos, ratings.",
      "recommendation": "Specific social proof enhancement recommendations based on what's missing"
    }
  ],
  "trustCredibility": [
    {
      "question": "Are trust symbols (like SSL, payment logos, or security badges) displayed?",
      "assessment": "Trust signals analysis: SSL: [Yes/No], Payment logos: [Yes/No], Security badges: [Yes/No]",
      "recommendation": "Specific trust symbol recommendations"
    },
    {
      "question": "Are customer testimonials or case studies included?",
      "assessment": "Testimonials: [Yes/No], Reviews: [Yes/No] based on trust signals",
      "recommendation": "Specific testimonial and case study recommendations"
    },
    {
      "question": "Are the privacy policy and refund guarantee easy to find?",
      "assessment": "Privacy policy: [Yes/No], Refund policy: [Yes/No] based on trust signals",
      "recommendation": "Specific policy visibility recommendations"
    },
    {
      "question": "Do forms only ask for essential information, keeping friction low?",
      "assessment": "Form analysis: [actual form data - inputs, required fields]",
      "recommendation": "Specific form optimization recommendations"
    }
  ],
  "testingAnalytics": [
    {
      "question": "Is Google Analytics and/or Hotjar installed on the site?",
      "assessment": "Analytics tracking: GA: [Yes/No], Hotjar: [Yes/No], GTM: [Yes/No]",
      "recommendation": "Specific analytics implementation recommendations"
    },
    {
      "question": "Is A/B testing planned or running (for example, on headlines, CTAs, or form layouts)?",
      "assessment": "Based on current tracking setup: [analysis]",
      "recommendation": "Specific A/B testing recommendations"
    },
    {
      "question": "Are heatmaps or session recordings reviewed regularly?",
      "assessment": "Hotjar detected: [Yes/No], other tracking: [Yes/No]",
      "recommendation": "Specific user behavior tracking recommendations"
    },
    {
      "question": "Is the conversion rate tracked for key actions (such as sign-ups, sales, or clicks)?",
      "assessment": "Current tracking setup suggests: [analysis based on tracking data]",
      "recommendation": "Specific conversion tracking recommendations"
    }
  ],
  "funnelFlow": [
    {
      "question": "Do product pages answer key questions and clearly show benefits?",
      "assessment": "Based on content analysis and page goal: [specific analysis]",
      "recommendation": "Specific product page improvements"
    },
    {
      "question": "Is the checkout process smooth, fast, and functional on all devices?",
      "assessment": "Performance analysis: Mobile: [score]/100, Desktop: [score]/100",
      "recommendation": "Specific checkout optimization based on performance data"
    },
    {
      "question": "Is the \"Thank You\" page optimized with next steps, upsells, or referral requests?",
      "assessment": "Cannot assess thank you page from current data",
      "recommendation": "Implement thank you page optimization strategies"
    },
    {
      "question": "Is there an email follow-up series to help move users closer to a purchase?",
      "assessment": "Cannot assess email sequences from current data",
      "recommendation": "Implement email nurture sequence recommendations"
    }
  ]
}

CRITICAL: Use the actual data provided. Reference specific metrics, content, and findings from the data above.`;
  }

  private static analyzePageGoal(pageData: PageData): string {
    const ctas = pageData.ctas;
    const title = pageData.meta.title;
    const h1 = pageData.headers.h1;
    const bodyText = pageData.bodyText.toLowerCase();
    
    // Analyze for common goal patterns
    const goalIndicators = {
      purchase: ['buy', 'purchase', 'order', 'shop', 'cart', 'checkout', 'price', '$'],
      signup: ['sign up', 'register', 'join', 'create account', 'get started', 'free trial'],
      booking: ['book', 'schedule', 'appointment', 'reserve', 'consultation'],
      lead: ['contact', 'quote', 'demo', 'free', 'download', 'subscribe', 'newsletter'],
      information: ['learn', 'about', 'services', 'how', 'what', 'why', 'blog', 'news']
    };
    
    const allText = (title + ' ' + h1 + ' ' + bodyText + ' ' + ctas.join(' ')).toLowerCase();
    
    const goalMatches = Object.entries(goalIndicators).map(([goal, keywords]) => ({
      goal,
      matchCount: keywords.reduce((count, keyword) => count + (allText.includes(keyword) ? 1 : 0), 0),
      matchedKeywords: keywords.filter(keyword => allText.includes(keyword))
    })).sort((a, b) => b.matchCount - a.matchCount);
    
    const primaryGoal = goalMatches[0];
    const secondaryGoal = goalMatches[1];
    
    let analysis = '';
    
    if (primaryGoal.matchCount === 0) {
      analysis = 'No clear primary goal detected from the page content and CTAs. The page lacks clear directional language that indicates what visitors should do. ';
    } else {
      // Determine goal clarity based on matches
      let goalClarity = '';
      if (primaryGoal.matchCount >= 4) {
        goalClarity = 'very clear';
      } else if (primaryGoal.matchCount >= 2) {
        goalClarity = 'moderately clear';
      } else {
        goalClarity = 'somewhat unclear';
      }
      
      analysis = `The primary goal appears to be ${primaryGoal.goal}, which is ${goalClarity} based on the page content. `;
      
      // Add details about what made it clear/unclear
      if (primaryGoal.matchedKeywords.length > 0) {
        analysis += `Key indicators found: ${primaryGoal.matchedKeywords.slice(0, 3).join(', ')}. `;
      }
      
      // Check for competing goals
      if (secondaryGoal.matchCount > 0 && secondaryGoal.matchCount >= primaryGoal.matchCount * 0.7) {
        analysis += `However, there are also strong indicators for ${secondaryGoal.goal}, which may create confusion about the page's main purpose. `;
      }
    }
    
    if (ctas.length === 0) {
      analysis += 'No clear calls-to-action found to guide visitor actions. ';
    } else if (ctas.length === 1) {
      analysis += 'Single CTA provides clear direction. ';
    } else if (ctas.length > 5) {
      analysis += 'Multiple CTAs may dilute focus and create decision paralysis. ';
    }
    
    return analysis;
  }

  private static analyzeSalesCopy(pageData: PageData): string {
    const h1 = pageData.headers.h1 || '';
    const h2s = pageData.headers.h2 || [];
    const metaDesc = pageData.meta.description || '';
    const bodyText = pageData.bodyText || '';
    const allText = (h1 + ' ' + h2s.join(' ') + ' ' + metaDesc + ' ' + bodyText).toLowerCase();
    
    // Word counts for analysis
    const totalWords = allText.split(/\s+/).filter(word => word.length > 0).length;
    const headlineWords = h1.split(/\s+/).filter(word => word.length > 0).length;
    
    // Emotional trigger indicators
    const emotionalWords = ['amazing', 'incredible', 'revolutionary', 'transform', 'discover', 'secret', 'proven', 'guaranteed', 'exclusive', 'limited', 'urgent', 'now', 'instantly', 'immediately', 'breakthrough', 'powerful', 'ultimate', 'perfect'];
    const urgencyWords = ['limited time', 'act now', 'hurry', 'deadline', 'expires', 'last chance', 'while supplies last', 'today only'];
    const benefitWords = ['save', 'gain', 'improve', 'increase', 'reduce', 'eliminate', 'achieve', 'get', 'earn', 'boost', 'enhance'];
    const featureWords = ['includes', 'contains', 'features', 'specifications', 'technical', 'dimensions', 'made of', 'built with'];
    
    const emotionalCount = emotionalWords.filter(word => allText.includes(word)).length;
    const urgencyCount = urgencyWords.filter(phrase => allText.includes(phrase)).length;
    const benefitCount = benefitWords.filter(word => allText.includes(word)).length;
    const featureCount = featureWords.filter(word => allText.includes(word)).length;
    
    // Readability indicators (simplified)
    const avgWordsPerSentence = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 0).length > 0 
      ? totalWords / bodyText.split(/[.!?]+/).filter(s => s.trim().length > 0).length 
      : 0;
    
    const longWords = allText.split(/\s+/).filter(word => word.length > 7).length;
    const longWordPercentage = totalWords > 0 ? (longWords / totalWords) * 100 : 0;
    
    return `Copy Analysis Summary:
- Total words: ${totalWords}
- H1 length: ${headlineWords} words
- Emotional triggers found: ${emotionalCount}
- Urgency phrases found: ${urgencyCount}  
- Benefit-oriented words: ${benefitCount}
- Feature-oriented words: ${featureCount}
- Benefit vs Feature ratio: ${benefitCount > 0 ? (benefitCount / Math.max(featureCount, 1)).toFixed(2) : '0'} (higher is better)
- Average words per sentence: ${avgWordsPerSentence.toFixed(1)}
- Long words (7+ chars): ${longWordPercentage.toFixed(1)}%
- Trust signal integration: ${pageData.trustSignals?.hasTestimonials ? 'testimonials present' : 'no testimonials'}, ${pageData.trustSignals?.hasReviews ? 'reviews present' : 'no reviews'}`;
  }

  private static summarizeCTAVisualData(ctaAnalysis: CTAAnalysisResult): string {
    const { analyzedCTAs, colorAnalysis, sizingAnalysis, positioningAnalysis, averageSize } = ctaAnalysis;
    
    if (analyzedCTAs.length === 0) {
      return 'No CTAs found for visual analysis.';
    }

    let summary = `Analyzed ${analyzedCTAs.length} CTAs visually. `;
    
    // Size analysis
    summary += `Average size: ${averageSize.width}x${averageSize.height}px. `;
    if (sizingAnalysis.tooSmall > 0) {
      summary += `${sizingAnalysis.tooSmall} CTAs too small (under 40x40px). `;
    }
    if (sizingAnalysis.tooLarge > 0) {
      summary += `${sizingAnalysis.tooLarge} CTAs very large (over 150x100px). `;
    }
    summary += `${sizingAnalysis.optimal} CTAs optimal size. `;

    // Contrast and accessibility
    if (colorAnalysis.contrastIssues > 0) {
      summary += `⚠️ ${colorAnalysis.contrastIssues} CTAs fail contrast accessibility standards. `;
    } else {
      summary += `✅ All CTAs pass contrast accessibility standards. `;
    }

    // Color diversity
    summary += `${colorAnalysis.uniqueBackgroundColors.length} unique background colors, ${colorAnalysis.uniqueTextColors.length} unique text colors. `;

    // Positioning
    summary += `Position: ${positioningAnalysis.aboveFold} above fold, ${positioningAnalysis.belowFold} below fold`;
    if (positioningAnalysis.fixed > 0) {
      summary += `, ${positioningAnalysis.fixed} fixed position`;
    }
    summary += '. ';

    // Individual CTA details for top 3
    const topCTAs = analyzedCTAs.slice(0, 3);
    if (topCTAs.length > 0) {
      summary += `Top CTAs: `;
      topCTAs.forEach((cta, i) => {
        summary += `"${cta.text}" (${Math.round(cta.dimensions.width)}x${Math.round(cta.dimensions.height)}px, contrast: ${cta.contrastRatio}, ${cta.accessibilityScore})`;
        if (i < topCTAs.length - 1) summary += ', ';
      });
      summary += '. ';
    }

    return summary;
  }

  private static analyzeCTAs(ctas: string[]): string {
    if (ctas.length === 0) {
      return 'No CTAs detected on the page.';
    }
    
    // Enhanced CTA analysis with clear categorization
    const actionWords = ['get', 'start', 'try', 'download', 'buy', 'book', 'schedule', 'contact', 'learn', 'discover', 'join', 'claim', 'grab', 'access', 'unlock', 'secure', 'reserve'];
    const valueWords = ['free', 'instant', 'quick', 'easy', 'save', 'exclusive', 'limited', 'bonus', 'discount', 'special', 'premium', 'guaranteed'];
    const urgencyWords = ['now', 'today', 'limited time', 'hurry', 'act fast', 'expires', 'deadline', 'while supplies last', 'don\'t miss out'];
    const specificityWords = ['trial', 'demo', 'quote', 'consultation', 'guide', 'report', 'toolkit', 'checklist', 'template'];
    
    const weakPatterns = ['click here', 'learn more', 'submit', 'continue', 'next', 'go'];
    
    let analysis = `Found ${ctas.length} CTAs. `;
    
    const ctaAnalysis = ctas.map((cta, index) => {
      const lowerCta = cta.toLowerCase();
      const hasAction = actionWords.some(word => lowerCta.includes(word));
      const hasValue = valueWords.some(word => lowerCta.includes(word));
      const hasUrgency = urgencyWords.some(word => lowerCta.includes(word));
      const hasSpecificity = specificityWords.some(word => lowerCta.includes(word));
      const isWeak = weakPatterns.some(pattern => lowerCta.includes(pattern));
      
      return {
        text: cta,
        hasAction,
        hasValue,
        hasUrgency,
        hasSpecificity,
        isWeak,
        length: cta.length,
        position: index + 1
      };
    });
    
    // Categorize CTAs based on qualities
    const strongCtas = ctaAnalysis.filter(cta => cta.hasAction && !cta.isWeak);
    const actionableCtas = ctaAnalysis.filter(cta => cta.hasAction || cta.hasValue || cta.hasSpecificity);
    const weakCtas = ctaAnalysis.filter(cta => cta.isWeak);
    const genericCtas = ctaAnalysis.filter(cta => !cta.hasAction && !cta.hasValue && !cta.hasSpecificity && !cta.isWeak);
    
    if (strongCtas.length > 0) {
      analysis += `Strong action-oriented CTAs: ${strongCtas.map(c => `"${c.text}"`).join(', ')}. `;
    }
    
    if (weakCtas.length > 0) {
      analysis += `Weak/generic CTAs needing improvement: ${weakCtas.map(c => `"${c.text}"`).join(', ')}. `;
    }
    
    if (genericCtas.length > 0) {
      analysis += `Generic CTAs that could be more specific: ${genericCtas.map(c => `"${c.text}"`).join(', ')}. `;
    }
    
    // CTA frequency analysis
    if (ctas.length === 1) {
      analysis += 'Single CTA detected - consider adding more for longer pages. ';
    } else if (ctas.length > 5) {
      analysis += 'High CTA frequency - may cause decision paralysis. ';
    }
    
    // Length analysis
    const tooShort = ctaAnalysis.filter(cta => cta.length < 8);
    const tooLong = ctaAnalysis.filter(cta => cta.length > 45);
    
    if (tooShort.length > 0) {
      analysis += `Very short CTAs: ${tooShort.map(c => `"${c.text}"`).join(', ')}. `;
    }
    
    if (tooLong.length > 0) {
      analysis += `Very long CTAs: ${tooLong.map(c => `"${c.text}"`).join(', ')}. `;
    }
    
    // Value proposition analysis
    const valueCtasCount = ctaAnalysis.filter(cta => cta.hasValue).length;
    const urgencyCtasCount = ctaAnalysis.filter(cta => cta.hasUrgency).length;
    
    if (valueCtasCount > 0) {
      analysis += `CTAs with value propositions: ${valueCtasCount}. `;
    }
    
    if (urgencyCtasCount > 0) {
      analysis += `CTAs with urgency elements: ${urgencyCtasCount}. `;
    }
    
    return analysis;
  }

  private static summarizeAccessibilityIssues(pageData: PageData): string {
    const desktopViolations = pageData.accessibilityDesktop?.violations || [];
    const mobileViolations = pageData.accessibilityMobile?.violations || [];
    
    if (desktopViolations.length === 0 && mobileViolations.length === 0) {
      return 'No accessibility issues detected';
    }

    const criticalIssues = [...desktopViolations, ...mobileViolations]
      .filter(v => v.severity === 'critical')
      .map(v => v.issue)
      .slice(0, 3);

    const seriousIssues = [...desktopViolations, ...mobileViolations]
      .filter(v => v.severity === 'serious')
      .map(v => v.issue)
      .slice(0, 3);

    let summary = `Desktop violations: ${desktopViolations.length}, Mobile violations: ${mobileViolations.length}`;
    
    if (criticalIssues.length > 0) {
      summary += `\nCritical issues: ${criticalIssues.join(', ')}`;
    }
    
    if (seriousIssues.length > 0) {
      summary += `\nSerious issues: ${seriousIssues.join(', ')}`;
    }

    return summary;
  }

  private static summarizePerformanceIssues(pageData: PageData): string {
    const desktop = pageData.lighthouseDesktop;
    const mobile = pageData.lighthouseMobile;
    
    if (!desktop && !mobile) {
      return 'Performance data not available';
    }

    let summary = '';
    
    if (desktop) {
      summary += `Desktop Performance: ${desktop.performance}/100, `;
      summary += `LCP: ${Math.round(desktop.largestContentfulPaint)}ms, `;
      summary += `CLS: ${Number(desktop.cumulativeLayoutShift).toFixed(3)}, `;
      summary += `FCP: ${Math.round(desktop.firstContentfulPaint)}ms, `;
      summary += `TBT: ${Math.round(desktop.totalBlockingTime)}ms, `;
      summary += `Speed Index: ${Math.round(desktop.speedIndex)}ms`;
    }
    
    if (mobile) {
      if (summary) summary += '\n';
      summary += `Mobile Performance: ${mobile.performance}/100, `;
      summary += `LCP: ${Math.round(mobile.largestContentfulPaint)}ms, `;
      summary += `CLS: ${Number(mobile.cumulativeLayoutShift).toFixed(3)}, `;
      summary += `FCP: ${Math.round(mobile.firstContentfulPaint)}ms, `;
      summary += `TBT: ${Math.round(mobile.totalBlockingTime)}ms, `;
      summary += `Speed Index: ${Math.round(mobile.speedIndex)}ms`;
    }

    return summary;
  }
}
