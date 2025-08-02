import { JSDOM } from 'jsdom';

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
  // First try the pattern-based approach for performance
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
  if (htmlIndicators >= 2) {
    return true;
  }

  // For edge cases, don't use jsdom as it's too permissive
  // The pattern-based approach is sufficient for contains-html
  return false;
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

  // Check for text content outside of tags using a simple regex approach first
  const tagPattern = /<[^>]+>/g;
  const textOutsideTags = trimmed.split(tagPattern).filter((text, index, arr) => {
    // First element is before first tag, last is after last tag
    if (index === 0 || index === arr.length - 1) {
      return text.trim() !== '';
    }
    return false;
  });

  if (textOutsideTags.length > 0) {
    return { isValid: false, reason: 'Output does not end with an HTML tag' };
  }

  try {
    // Use jsdom to parse and validate HTML
    const dom = new JSDOM(trimmed, {
      // Don't execute scripts
      runScripts: 'outside-only',
      // Don't load external resources
      resources: undefined,
      // Pretend we're in a browser context
      pretendToBeVisual: false,
      // Don't include the jsdom implementation in the window
      includeNodeLocations: false,
    });

    const { document } = dom.window;

    // Check if parsing resulted in a valid document
    if (!document || !document.documentElement) {
      return { isValid: false, reason: 'Failed to parse HTML' };
    }

    // JSDOM wraps content in html/body tags, so we need to check the original content

    // Check if jsdom had to wrap our content (meaning it wasn't a complete document)
    const isFragment =
      !trimmed.toLowerCase().includes('<body') && !trimmed.toLowerCase().includes('<html');

    if (isFragment) {
      // For fragments, check if jsdom modified the content significantly
      // This catches cases like "<custom>" which jsdom auto-closes to "<custom></custom>"

      // Check if it's a valid HTML fragment by ensuring it has known HTML tags
      const hasKnownHtmlTags =
        /<(div|span|p|a|img|h[1-6]|ul|ol|li|table|tr|td|th|form|input|button|script|style|link|meta|br|hr|strong|em|b|i|u|code|pre|blockquote|section|article|nav|header|footer|main|aside|abbr|address|area|audio|base|bdi|bdo|canvas|caption|cite|col|colgroup|data|datalist|dd|del|details|dfn|dialog|dl|dt|embed|fieldset|figcaption|figure|iframe|ins|kbd|label|legend|map|mark|menu|meter|noscript|object|optgroup|option|output|param|picture|progress|q|rp|rt|ruby|s|samp|select|small|source|sub|summary|sup|svg|template|textarea|time|title|track|var|video|wbr)\b/i.test(
          trimmed,
        );
      if (!hasKnownHtmlTags) {
        return { isValid: false, reason: 'Output does not contain recognized HTML elements' };
      }
    }

    // Check if there's any text content at the root level
    if (isFragment && document.body) {
      for (const node of document.body.childNodes) {
        if (node.nodeType === 3 /* TEXT_NODE */ && node.textContent?.trim()) {
          // There's text content outside of HTML elements
          return { isValid: false, reason: 'Output contains non-HTML content outside of tags' };
        }
      }
    }

    return { isValid: true, reason: 'Output is valid HTML' };
  } catch (error) {
    // If jsdom fails to parse, it's not valid HTML
    return {
      isValid: false,
      reason: `HTML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
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
