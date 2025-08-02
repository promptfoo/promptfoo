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

// List of valid HTML5 elements (excluding obsolete elements)
const VALID_HTML_ELEMENTS = new Set([
  // Document metadata
  'html',
  'head',
  'title',
  'base',
  'link',
  'meta',
  'style',
  // Content sectioning
  'body',
  'article',
  'section',
  'nav',
  'aside',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'footer',
  'address',
  // Text content
  'p',
  'hr',
  'pre',
  'blockquote',
  'ol',
  'ul',
  'li',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'main',
  'div',
  // Inline text semantics
  'a',
  'em',
  'strong',
  'small',
  's',
  'cite',
  'q',
  'dfn',
  'abbr',
  'ruby',
  'rt',
  'rp',
  'data',
  'time',
  'code',
  'var',
  'samp',
  'kbd',
  'sub',
  'sup',
  'i',
  'b',
  'u',
  'mark',
  'bdi',
  'bdo',
  'span',
  'br',
  'wbr',
  // Image and multimedia
  'img',
  'iframe',
  'embed',
  'object',
  'param',
  'picture',
  'source',
  'video',
  'audio',
  'track',
  'map',
  'area',
  // Embedded content
  'svg',
  'math',
  // Scripting
  'script',
  'noscript',
  'canvas',
  // Demarcating edits
  'ins',
  'del',
  // Table content
  'table',
  'caption',
  'colgroup',
  'col',
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'td',
  'th',
  // Forms
  'form',
  'label',
  'input',
  'button',
  'select',
  'datalist',
  'optgroup',
  'option',
  'textarea',
  'output',
  'progress',
  'meter',
  'fieldset',
  'legend',
  // Interactive elements
  'details',
  'summary',
  'dialog',
  'menu',
  // Web Components
  'slot',
  'template',
]);

function validateHtml(htmlString: string): { isValid: boolean; reason: string } {
  const trimmed = htmlString.trim();

  if (!trimmed) {
    return { isValid: false, reason: 'Output is empty' };
  }

  // Exclude XML documents
  if (/^\s*<\?xml/i.test(trimmed)) {
    return { isValid: false, reason: 'Output appears to be XML, not HTML' };
  }

  // Must start with < and end with >
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) {
    return { isValid: false, reason: 'Output must be wrapped in HTML tags' };
  }

  // Quick check for text between tags (e.g., "</div>text<span>")
  // This catches the most common case of mixed content
  if (/>([^<]+)<(?!\/)/g.test(trimmed)) {
    const match = trimmed.match(/>([^<]+)<(?!\/)/);
    if (match && match[1].trim()) {
      return { isValid: false, reason: 'Output contains text outside of HTML tags' };
    }
  }

  try {
    // Parse with jsdom
    const dom = new JSDOM(trimmed, {
      runScripts: 'outside-only',
      resources: undefined,
      pretendToBeVisual: false,
      includeNodeLocations: false,
    });

    const { document } = dom.window;

    if (!document || !document.documentElement) {
      return { isValid: false, reason: 'Failed to parse HTML' };
    }

    // Check if it's a complete document or a fragment
    const isCompleteDoc = /<!doctype\s+html|<html/i.test(trimmed);

    if (!isCompleteDoc) {
      // For fragments, ensure at least one valid element exists
      // Extract first element name
      const elementMatch = trimmed.match(/<([a-zA-Z][a-zA-Z0-9-]*)/);
      if (!elementMatch) {
        return { isValid: false, reason: 'No valid HTML element found' };
      }

      const elementName = elementMatch[1].toLowerCase();

      // Check if it's either:
      // 1. A standard HTML element
      // 2. A custom element (contains hyphen as per Web Components spec)
      const isValidElement = VALID_HTML_ELEMENTS.has(elementName) || elementName.includes('-');

      if (!isValidElement) {
        return { isValid: false, reason: 'Output does not contain recognized HTML elements' };
      }
    }

    return { isValid: true, reason: 'Output is valid HTML' };
  } catch (error) {
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
