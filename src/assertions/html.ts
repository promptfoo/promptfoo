import { html, parse } from 'parse5';
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
  if ('content' in node) {
    return node.content.childNodes;
  }
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

// Patterns that indicate HTML content, with their contribution to the score.
const HTML_PATTERNS = [
  // Opening and closing tags count independently, even when their names differ.
  // Opening tags with optional attributes - fixed to prevent ReDoS
  [/<[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/, 1],
  // Closing tags
  [/<\/[a-zA-Z][a-zA-Z0-9-]*\s*>/, 1],
  // Self-closing tags - fixed to prevent ReDoS
  [/<[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/>/, 1],
  // HTML entities
  [/&(?:[a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/, 1],
  // DOCTYPE is a strong indicator
  [/<!DOCTYPE\s+html/i, 2],
  // HTML comments - using non-greedy quantifier to prevent ReDoS
  [/<!--[^-]*(?:-[^-]+)*-->/, 1],
  // Common attribute patterns - simplified to prevent ReDoS
  [/\s[a-zA-Z-]+=\s*["'][^"']*["']/, 1],
  // Quick check for very common HTML tags to reduce false positives
  [
    /<(html|head|body|div|span|p|a|img|h[1-6]|ul|ol|li|table|tr|td|th|form|input|button|script|style|link|meta|br|hr)\b/i,
    2,
  ],
] as const;

// Maximum input size to prevent DoS attacks (10MB)
const MAX_INPUT_SIZE = 10 * 1024 * 1024;

function containsHtml(text: string): boolean {
  // Size limit check to prevent DoS
  if (text.length > MAX_INPUT_SIZE) {
    return false;
  }

  // First try the pattern-based approach for performance
  let htmlIndicators = 0;

  for (const [pattern, weight] of HTML_PATTERNS) {
    if (pattern.test(text)) {
      htmlIndicators += weight;
    }
  }

  // Require at least 2 indicators to consider it HTML.
  // The pattern-based approach is intentionally strict for contains-html to avoid
  // false positives on prose containing stray angle brackets.
  return htmlIndicators >= 2;
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

const VOID_HTML_ELEMENTS = new Set([
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
  'param',
  'source',
  'track',
  'wbr',
]);

const OPTIONAL_END_TAG_ELEMENTS = new Set([
  'html',
  'head',
  'body',
  'li',
  'dt',
  'dd',
  'p',
  'rt',
  'rp',
  'optgroup',
  'option',
  'colgroup',
  'caption',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
]);

const siblingIndexesByParent = new WeakMap<HtmlParentNode, Map<HtmlChildNode, number>>();

function getSiblingIndex(parent: HtmlParentNode, element: HtmlElement): number {
  let siblingIndexes = siblingIndexesByParent.get(parent);
  if (!siblingIndexes) {
    siblingIndexes = new Map(parent.childNodes.map((node, index) => [node, index]));
    siblingIndexesByParent.set(parent, siblingIndexes);
  }
  return siblingIndexes.get(element) ?? -1;
}

// These HTML parents require a closing paragraph tag even at the end of their contents.
const EXPLICIT_PARAGRAPH_END_PARENTS = new Set([
  'a',
  'audio',
  'del',
  'ins',
  'map',
  'noscript',
  'video',
]);

function requiresParagraphEndAtParentEnd(element: HtmlElement): boolean {
  const parent = element.parentNode;
  return (
    !!parent &&
    isElementNode(parent) &&
    (EXPLICIT_PARAGRAPH_END_PARENTS.has(parent.tagName) || parent.tagName.includes('-'))
  );
}

// parse5's adoption-agency recovery moves a paragraph out of its source
// link and inserts a reconstructed link inside it, with no source location.
function hasUnclosedParagraphInLink(element: HtmlElement, previous: HtmlNode | undefined): boolean {
  const start = element.sourceCodeLocation?.startTag;
  const link =
    previous && isElementNode(previous) && previous.tagName === 'a'
      ? previous.sourceCodeLocation
      : undefined;
  return Boolean(
    start &&
      link?.startTag &&
      link.endTag &&
      link.startTag.endOffset <= start.startOffset &&
      link.endTag.startOffset >= start.endOffset &&
      element.childNodes.some(
        (child) => isElementNode(child) && child.tagName === 'a' && !hasSourceCodeLocation(child),
      ),
  );
}

function canOmitEndTag(element: HtmlElement, tagName: string): boolean {
  if ((tagName === 'thead' || tagName === 'dt') && element.parentNode) {
    const parent = element.parentNode;
    const next = parent.childNodes[getSiblingIndex(parent, element) + 1];
    if (!next || !isElementNode(next)) {
      return false;
    }
    return tagName === 'dt'
      ? next.tagName === 'dt' || next.tagName === 'dd'
      : next.tagName === 'tbody' || next.tagName === 'tfoot';
  }
  if (tagName === 'p' && element.parentNode) {
    const parent = element.parentNode;
    const index = getSiblingIndex(parent, element);
    if (index === parent.childNodes.length - 1 && requiresParagraphEndAtParentEnd(element)) {
      return false;
    }
    const previous = parent.childNodes[index - 1];
    if (hasUnclosedParagraphInLink(element, previous)) {
      return false;
    }
  }
  return OPTIONAL_END_TAG_ELEMENTS.has(tagName);
}

function hasSelfClosingStartTag(element: HtmlElement, input: string): boolean {
  const location = element.sourceCodeLocation;
  if (!location?.startTag) {
    return false;
  }
  const slashOffset = location.startTag.endOffset - 2;
  return (
    input[slashOffset] === '/' &&
    Object.values(location.attrs ?? {}).every((attr) => attr.endOffset <= slashOffset)
  );
}

function isUnclosedElement(element: HtmlElement, input: string, inputLowercase: string): boolean {
  const tagName = element.tagName.toLowerCase();
  return (
    hasSourceCodeLocation(element) &&
    !element.sourceCodeLocation?.endTag &&
    (element.namespaceURI === html.NS.HTML
      ? !VOID_HTML_ELEMENTS.has(tagName) &&
        (hasSelfClosingStartTag(element, input) || !canOmitEndTag(element, tagName)) &&
        isUserProvidedElement(element, inputLowercase)
      : !hasSelfClosingStartTag(element, input))
  );
}

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

  const unclosedElement = findFirstElement(document, (element) =>
    isUnclosedElement(element, trimmed, inputLowercase),
  );

  if (unclosedElement) {
    return {
      isValid: false,
      reason: `Output contains an unclosed <${unclosedElement.tagName}> element`,
    };
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
