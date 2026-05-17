import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

import type { AssertionParams, GradingResult } from '../types/index';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlChildNode = DefaultTreeAdapterMap['childNode'];
type HtmlElement = DefaultTreeAdapterMap['element'];
type HtmlParentNode = DefaultTreeAdapterMap['parentNode'];

// Matches a literal opening tag for html/head/body — the next character must
// terminate the tag name (whitespace, `>`, or `/`). Without this
// guard a substring check like `input.includes('<head')` would false-positive
// on tags that merely share a prefix, e.g. `<headphones>` or `<bodyguard>`.
const LITERAL_WRAPPER_PATTERNS = {
  html: /<html(?=[\s>/])/,
  head: /<head(?=[\s>/])/,
  body: /<body(?=[\s>/])/,
} as const;

type WrapperTagName = keyof typeof LITERAL_WRAPPER_PATTERNS;

function isWrapperTagName(tagName: string): tagName is WrapperTagName {
  return tagName === 'html' || tagName === 'head' || tagName === 'body';
}

function isTextNode(node: HtmlNode): node is DefaultTreeAdapterMap['textNode'] {
  return node.nodeName === '#text';
}

function isElementNode(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function hasSourceCodeLocation(element: HtmlElement): boolean {
  return (
    'sourceCodeLocation' in element &&
    element.sourceCodeLocation !== null &&
    element.sourceCodeLocation !== undefined
  );
}

function getChildNodes(node: HtmlNode): HtmlChildNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}

// Iterative pre-order DFS. Avoids the ~10-15k V8 stack-frame limit on
// adversarially deep inputs (parse5 imposes no tree-depth cap).
function findFirstElement(
  root: HtmlNode,
  predicate: (element: HtmlElement) => boolean,
): HtmlElement | undefined {
  const stack: HtmlNode[] = [root];
  while (stack.length > 0) {
    const current = stack.pop() as HtmlNode;
    if (isElementNode(current) && predicate(current)) {
      return current;
    }
    const children = getChildNodes(current);
    // Push in reverse so pop() yields document order.
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
  return undefined;
}

function hasTopLevelText(parentNode: HtmlParentNode): boolean {
  return parentNode.childNodes.some((node) => isTextNode(node) && Boolean(node.value.trim()));
}

function isUserProvidedElement(element: HtmlElement, inputLowercase: string): boolean {
  const tagName = element.tagName.toLowerCase();
  if (isWrapperTagName(tagName)) {
    return LITERAL_WRAPPER_PATTERNS[tagName].test(inputLowercase) && hasSourceCodeLocation(element);
  }
  return VALID_HTML_ELEMENTS.has(tagName) || tagName.includes('-');
}

// Patterns that indicate HTML content
const HTML_PATTERNS = {
  // Opening tags with optional attributes - fixed to prevent ReDoS
  openingTag: /<[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/,
  // Closing tags
  closingTag: /<\/[a-zA-Z][a-zA-Z0-9-]*\s*>/,
  // Self-closing tags - fixed to prevent ReDoS
  selfClosingTag: /<[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/>/,
  // HTML entities
  htmlEntity: /&(?:[a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/,
  // DOCTYPE declaration
  doctype: /<!DOCTYPE\s+html/i,
  // HTML comments - using non-greedy quantifier to prevent ReDoS
  htmlComment: /<!--[^-]*(?:-[^-]+)*-->/,
  // Common attribute patterns - simplified to prevent ReDoS
  htmlAttribute: /\s[a-zA-Z-]+=\s*["'][^"']*["']/,
};

// Maximum input size to prevent DoS attacks (10MB)
const MAX_INPUT_SIZE = 10 * 1024 * 1024;

function containsHtml(text: string): boolean {
  // Size limit check to prevent DoS
  if (text.length > MAX_INPUT_SIZE) {
    return false;
  }

  // First try the pattern-based approach for performance
  let htmlIndicators = 0;

  // Check for paired tags (opening and closing)
  const hasOpening = HTML_PATTERNS.openingTag.test(text);
  const hasClosing = HTML_PATTERNS.closingTag.test(text);
  if (hasOpening && hasClosing) {
    htmlIndicators += 2;
  } else if (hasOpening || hasClosing) {
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

  // The pattern-based approach is intentionally strict for contains-html to avoid
  // false positives on prose containing stray angle brackets.
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

  // Size limit check to prevent DoS
  if (trimmed.length > MAX_INPUT_SIZE) {
    return { isValid: false, reason: 'Output exceeds maximum size limit' };
  }

  // Exclude XML documents
  if (/^\s*<\?xml/i.test(trimmed)) {
    return { isValid: false, reason: 'Output appears to be XML, not HTML' };
  }

  const document = parse(trimmed, { sourceCodeLocationInfo: true });
  const inputLowercase = trimmed.toLowerCase();
  const body = findFirstElement(document, (element) => element.tagName === 'body');

  // parse5 auto-wraps fragments and plain text in <html><head><body>, so if the
  // input didn't include <body> itself, treat top-level body text as invalid.
  const hasUserProvidedBody =
    body !== undefined &&
    LITERAL_WRAPPER_PATTERNS.body.test(inputLowercase) &&
    hasSourceCodeLocation(body);

  if (!hasUserProvidedBody && body && hasTopLevelText(body)) {
    return { isValid: false, reason: 'Output must be wrapped in HTML tags' };
  }

  const userProvidedElement = findFirstElement(document, (element) =>
    isUserProvidedElement(element, inputLowercase),
  );

  if (!userProvidedElement) {
    return { isValid: false, reason: 'Output does not contain recognized HTML elements' };
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
