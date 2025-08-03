import * as cheerio from 'cheerio';

export class ScrapeHelpers {
  /**
   * Extracts a clean H1 heading, handling animated or concatenated content
   */
  static extractCleanH1($: cheerio.CheerioAPI): string {
    const h1Element = $('h1').first();
    if (!h1Element.length) return '';
    
    let h1Text = h1Element.text().trim();
    
    // If the H1 seems too long or has multiple concatenated phrases, try to clean it
    if (h1Text.length > 100 || this.hasMultipleConcatenatedPhrases(h1Text)) {
      // Try to get text from the first visible/primary child element
      const firstTextNode = h1Element.contents().filter(function() {
        return this.nodeType === 3 && $(this).text().trim().length > 0; // Text nodes only
      }).first();
      
      if (firstTextNode.length) {
        const cleanText = firstTextNode.text().trim();
        if (cleanText.length > 10 && cleanText.length < h1Text.length * 0.7) {
          return cleanText;
        }
      }
      
      // Try to get text from first direct child element
      const firstChild = h1Element.children().first();
      if (firstChild.length) {
        const childText = firstChild.text().trim();
        if (childText.length > 10 && childText.length < h1Text.length * 0.7) {
          return childText;
        }
      }
      
      // Split by common separators and take the first meaningful part
      const parts = h1Text.split(/[|•·\n\r\t]/).map(part => part.trim()).filter(part => part.length > 5);
      if (parts.length > 1 && parts[0].length > 10) {
        return parts[0];
      }
      
      // If text contains multiple capitalized words that might be concatenated, try to extract the first sentence
      const sentences = h1Text.split(/(?<=[.!?])\s+|(?=[A-Z][a-z].*[A-Z][a-z])/);
      if (sentences.length > 1 && sentences[0].length > 10 && sentences[0].length < 80) {
        return sentences[0].trim();
      }
    }
    
    return h1Text;
  }
  
  /**
   * Detects if text has multiple concatenated phrases (like animated content)
   */
  static hasMultipleConcatenatedPhrases(text: string): boolean {
    // Check for signs of concatenated phrases like multiple capital letters starting words
    const capitalWords = text.match(/[A-Z][a-z]+/g) || [];
    const hasMultipleCapitalizedSequences = capitalWords.length > 4;
    
    // Check for lack of spaces between what should be separate phrases
    const hasConcatenatedWords = /[a-z][A-Z]/.test(text);
    
    return hasMultipleCapitalizedSequences || hasConcatenatedWords;
  }
}
