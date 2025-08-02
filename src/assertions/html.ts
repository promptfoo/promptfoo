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

  try {
    // Parse with jsdom - let it handle all HTML parsing
    const dom = new JSDOM(trimmed, {
      runScripts: 'outside-only',
      resources: undefined,
      pretendToBeVisual: false,
      includeNodeLocations: false,
      // Don't try to parse as XML
      contentType: 'text/html',
    });

    const { document } = dom.window;

    if (!document || !document.documentElement) {
      return { isValid: false, reason: 'Failed to parse HTML' };
    }

    // Check for invalid content by examining what JSDOM had to do
    // If JSDOM wrapped the content in body tags, check what's inside
    if (document.body && !trimmed.toLowerCase().includes('<body')) {
      const bodyNodes = Array.from(document.body.childNodes);

      // Check for any non-whitespace text nodes
      const textNodes = bodyNodes.filter(
        (node) => node.nodeType === 3 /* TEXT_NODE */ && node.textContent?.trim(),
      );

      // Check for element nodes
      const elementNodes = bodyNodes.filter((node) => node.nodeType === 1 /* ELEMENT_NODE */);

      // Case 1: Plain text only (no HTML tags at all)
      if (textNodes.length > 0 && elementNodes.length === 0) {
        return { isValid: false, reason: 'Output must be wrapped in HTML tags' };
      }

      // Case 2: Mixed content (text and elements at the same level)
      if (textNodes.length > 0 && elementNodes.length > 0) {
        return { isValid: false, reason: 'Output must be wrapped in HTML tags' };
      }
    }

    // Validate that we have actual HTML elements (not just text that got wrapped)
    const allElements = Array.from(document.querySelectorAll('*'));

    // Filter out elements that JSDOM adds automatically (unless they're in the original input)
    const userElements = allElements.filter((element) => {
      const tagName = element.tagName.toLowerCase();
      // Keep the element if it's explicitly in the input or it's not an auto-added element
      return (
        trimmed.toLowerCase().includes(`<${tagName}`) || !['html', 'head', 'body'].includes(tagName)
      );
    });

    // Check if any of the user's elements are valid
    const hasValidHtmlElement = userElements.some((element) => {
      const tagName = element.tagName.toLowerCase();
      return VALID_HTML_ELEMENTS.has(tagName) || tagName.includes('-');
    });

    if (!hasValidHtmlElement) {
      return { isValid: false, reason: 'Output does not contain recognized HTML elements' };
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
