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
  const commonTags =
    /<(html|head|body|div|span|p|a|img|h[1-6]|ul|ol|li|table|tr|td|th|form|input|button|script|style|link|meta|br|hr)\b/i;
  if (commonTags.test(text)) {
    htmlIndicators += 2;
  }

  // Require at least 2 indicators to consider it HTML
  // This helps avoid false positives from things like "a < b" or "<example>"
  return htmlIndicators >= 2;
}

function validateHtml(htmlString: string): { isValid: boolean; reason: string } {
  // Trim whitespace
  const trimmed = htmlString.trim();

  if (!trimmed) {
    return { isValid: false, reason: 'Output is empty' };
  }

  // Exclude XML documents
  if (/^\s*<\?xml/i.test(trimmed)) {
    return { isValid: false, reason: 'Output appears to be XML, not HTML' };
  }

  // Check if it starts with an HTML tag or DOCTYPE
  const startsWithTag = /^<(!DOCTYPE\s+html|[a-zA-Z][a-zA-Z0-9-]*)/i.test(trimmed);
  if (!startsWithTag) {
    return { isValid: false, reason: 'Output does not start with an HTML tag or DOCTYPE' };
  }

  // Check if it ends with a tag
  const endsWithTag = />$/;
  if (!endsWithTag.test(trimmed)) {
    return { isValid: false, reason: 'Output does not end with an HTML tag' };
  }

  // Check for text content outside of tags
  // Split by tags and check if there's any non-whitespace content outside
  const tagPattern = /<[^>]+>/g;
  const textOutsideTags = trimmed.split(tagPattern).filter((text, index, arr) => {
    // First element is before first tag, last is after last tag
    if (index === 0 || index === arr.length - 1) {
      return text.trim() !== '';
    }
    return false;
  });

  if (textOutsideTags.length > 0) {
    return { isValid: false, reason: 'Output contains non-HTML content outside of tags' };
  }

  // Use the containsHtml function for additional validation
  if (!containsHtml(trimmed)) {
    return { isValid: false, reason: 'Output does not contain enough HTML indicators' };
  }

  // Check for basic HTML structure
  const hasOpeningTags = /<[a-zA-Z][a-zA-Z0-9-]*(?:\s+[^>]*)?>/.test(trimmed);

  if (!hasOpeningTags) {
    return { isValid: false, reason: 'Output does not contain any HTML opening tags' };
  }

  // Check for unclosed tags at the end
  // If the last tag is an opening tag (not self-closing or void), ensure there's no content after it
  const lastTag = trimmed.match(/<[^>]+>(?!.*<[^>]+>)/);
  if (lastTag) {
    const tag = lastTag[0];
    const isOpeningTag = !tag.startsWith('</') && !tag.endsWith('/>');
    const tagName = tag.match(/<([a-zA-Z][a-zA-Z0-9-]*)/)?.[1]?.toLowerCase();
    const voidElements = [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'source',
      'track',
      'wbr',
    ];

    if (isOpeningTag && tagName && !voidElements.includes(tagName)) {
      // Check if there's content after this opening tag
      const afterTag = trimmed.substring(trimmed.lastIndexOf(tag) + tag.length);
      if (afterTag.trim()) {
        return { isValid: false, reason: 'Output does not end with an HTML tag' };
      }
    }
  }

  return { isValid: true, reason: 'Output is valid HTML' };
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

export const handleIsHtml = ({
  assertion,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  const result = validateHtml(outputString);
  const pass = result.isValid !== inverse;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : result.reason,
    assertion,
  };
};
