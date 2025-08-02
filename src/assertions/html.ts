import type { AssertionParams, GradingResult } from '../types';

// Patterns that indicate HTML content
const HTML_PATTERNS = {
  // Opening tags with optional attributes
  openingTag: /<[a-zA-Z][a-zA-Z0-9-]*(?:\s+[^>]*)?>/,
  // Closing tags
  closingTag: /<\/[a-zA-Z][a-zA-Z0-9-]*\s*>/,
  // Self-closing tags
  selfClosingTag: /<[a-zA-Z][a-zA-Z0-9-]*(?:\s+[^>]*)?\/>/,
  // HTML entities
  htmlEntity: /&(?:[a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/,
  // DOCTYPE declaration
  doctype: /<!DOCTYPE\s+html/i,
  // HTML comments
  htmlComment: /<!--[\s\S]*?-->/,
  // Common attribute patterns
  htmlAttribute: /\s+[a-zA-Z-]+\s*=\s*["'][^"']*["']/,
};

function containsHtml(text: string): boolean {
  // Count different HTML indicators
  let htmlIndicators = 0;
  
  // Check for paired tags (opening and closing)
  const openingMatches = text.match(HTML_PATTERNS.openingTag);
  const closingMatches = text.match(HTML_PATTERNS.closingTag);
  if (openingMatches && closingMatches) {
    htmlIndicators += 2;
  } else if (openingMatches || closingMatches) {
    htmlIndicators += 1;
  }
  
  // Check for self-closing tags
  if (HTML_PATTERNS.selfClosingTag.test(text)) {
    htmlIndicators += 1;
  }
  
  // Check for HTML entities
  if (HTML_PATTERNS.htmlEntity.test(text)) {
    htmlIndicators += 1;
  }
  
  // Check for DOCTYPE
  if (HTML_PATTERNS.doctype.test(text)) {
    htmlIndicators += 2; // DOCTYPE is a strong indicator
  }
  
  // Check for HTML comments
  if (HTML_PATTERNS.htmlComment.test(text)) {
    htmlIndicators += 1;
  }
  
  // Check for HTML attributes
  if (HTML_PATTERNS.htmlAttribute.test(text)) {
    htmlIndicators += 1;
  }
  
  // Quick check for very common HTML tags to reduce false positives
  const commonTags = /<(html|head|body|div|span|p|a|img|h[1-6]|ul|ol|li|table|tr|td|th|form|input|button|script|style|link|meta|br|hr)\b/i;
  if (commonTags.test(text)) {
    htmlIndicators += 2;
  }
  
  // Require at least 2 indicators to consider it HTML
  // This helps avoid false positives from things like "a < b" or "<example>"
  return htmlIndicators >= 2;
}

export const handleContainsHtml = ({
  assertion,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  const hasHtml = containsHtml(outputString);
  const pass = hasHtml !== inverse;
  
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass 
      ? 'Assertion passed' 
      : `Expected output to ${inverse ? 'not ' : ''}contain HTML content`,
    assertion,
  };
};