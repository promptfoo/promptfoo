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

// Elements that never take an end tag (void elements).
const VOID_ELEMENTS = new Set([
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

// Block-level elements that make a <p> end tag omissible when they follow it.
const BLOCK_ELEMENTS_AFTER_P = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'search',
  'section',
  'table',
  'ul',
]);

// End-tag omission rules from the HTML spec, keyed by tag name. `nextElement` is
// the tag name of the next element sibling (undefined when there is none) and
// `hasMoreContent` whether any sibling - element or non-blank text - follows the
// element. A tag missing from this map always needs its end tag (or is void).
const OPTIONAL_END_TAG_RULES: Record<
  string,
  (nextElement: string | undefined, hasMoreContent: boolean) => boolean
> = {
  html: () => true,
  head: () => true,
  body: () => true,
  p: (nextElement, hasMoreContent) =>
    (nextElement !== undefined && BLOCK_ELEMENTS_AFTER_P.has(nextElement)) || !hasMoreContent,
  li: (nextElement, hasMoreContent) => nextElement === 'li' || !hasMoreContent,
  dt: (nextElement, hasMoreContent) =>
    nextElement === 'dt' || nextElement === 'dd' || !hasMoreContent,
  dd: (nextElement, hasMoreContent) =>
    nextElement === 'dd' || nextElement === 'dt' || !hasMoreContent,
  rt: (nextElement, hasMoreContent) =>
    nextElement === 'rt' || nextElement === 'rp' || !hasMoreContent,
  rp: (nextElement, hasMoreContent) =>
    nextElement === 'rp' || nextElement === 'rt' || !hasMoreContent,
  optgroup: (nextElement, hasMoreContent) => nextElement === 'optgroup' || !hasMoreContent,
  option: (nextElement, hasMoreContent) =>
    nextElement === 'option' || nextElement === 'optgroup' || !hasMoreContent,
  colgroup: (nextElement, hasMoreContent) => !hasMoreContent || nextElement !== undefined,
  caption: (nextElement, hasMoreContent) => !hasMoreContent || nextElement !== undefined,
  thead: (nextElement) => nextElement === 'tbody' || nextElement === 'tfoot',
  tbody: (nextElement, hasMoreContent) =>
    nextElement === 'tbody' || nextElement === 'tfoot' || !hasMoreContent,
  tfoot: (_nextElement, hasMoreContent) => !hasMoreContent,
  tr: (nextElement, hasMoreContent) => nextElement === 'tr' || !hasMoreContent,
  td: (nextElement, hasMoreContent) =>
    nextElement === 'td' || nextElement === 'th' || !hasMoreContent,
  th: (nextElement, hasMoreContent) =>
    nextElement === 'th' || nextElement === 'td' || !hasMoreContent,
};

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

interface FollowingContext {
  nextElement: string | undefined;
  previous?: HtmlChildNode;
  hasMoreContent: boolean;
}

// Per-parent cache of following-sibling context for each child, computed in one
// O(children) suffix pass on first use. Rescanning siblings per element (a
// '<p>x'.repeat(n) output has n such siblings under one parent) is quadratic.
const followingContextCache = new WeakMap<
  HtmlParentNode,
  WeakMap<HtmlChildNode, FollowingContext>
>();

// The following siblings of an element: the tag name of the next element sibling
// (undefined when none) and whether any sibling - element or non-blank text -
// follows it.
function getFollowingContext(element: HtmlElement): FollowingContext {
  const parent = element.parentNode;
  if (!parent || !('childNodes' in parent)) {
    return { nextElement: undefined, hasMoreContent: false };
  }
  let parentCache = followingContextCache.get(parent as HtmlParentNode);
  if (!parentCache) {
    parentCache = new WeakMap<HtmlChildNode, FollowingContext>();
    const siblings = (parent as HtmlParentNode).childNodes as HtmlChildNode[];
    let nextElement: string | undefined;
    let hasMoreContent = false;
    for (let i = siblings.length - 1; i >= 0; i--) {
      const sibling = siblings[i];
      parentCache.set(sibling, { nextElement, hasMoreContent, previous: siblings[i - 1] });
      if (isElementNode(sibling)) {
        // Always update: this is the nearest following element for earlier siblings.
        nextElement = sibling.tagName.toLowerCase();
        hasMoreContent = true;
      } else if (isTextNode(sibling) && sibling.value.trim()) {
        hasMoreContent = true;
      }
    }
    followingContextCache.set(parent as HtmlParentNode, parentCache);
  }
  return (
    parentCache.get(element as HtmlChildNode) ?? { nextElement: undefined, hasMoreContent: false }
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

// parse5 closes any open element at the end of input without reporting it, so
// an unclosed <div> or a truncated document otherwise passes. A source-backed
// element whose start tag exists but whose end tag does not is unclosed; void
// elements and elements whose end tag the HTML spec lets authors omit in this
// position are exempt. Foreign content (SVG/MathML) permits actual self-closing
// syntax, so a foreign element is exempt only when its start tag in the source
// really ends with `/>` - `<svg><circle></svg>` is unclosed even though the
// circle is foreign. A self-closing non-void tag such as <div /> has no end
// tag here, which matches the HTML spec: the slash is ignored and the element
// stays open.
function isUnclosedElement(element: HtmlElement, input: string): boolean {
  if (!hasSourceCodeLocation(element)) {
    return false;
  }
  const location = element.sourceCodeLocation as NonNullable<HtmlElement['sourceCodeLocation']>;
  if (!location.startTag || location.endTag) {
    return false;
  }
  // A slash after an unquoted attribute value belongs to that value.
  const slashOffset = location.startTag.endOffset - 2;
  const explicitlySelfClosed =
    input[slashOffset] === '/' &&
    Object.values(location.attrs ?? {}).every((attr) => attr.endOffset <= slashOffset);
  if (element.namespaceURI !== HTML_NAMESPACE) {
    // Foreign content permits actual self-closing syntax; a missing end tag
    // without it (e.g. `<svg><circle></svg>`) is unclosed.
    return !explicitlySelfClosed;
  }
  const tagName = element.tagName.toLowerCase();
  if (VOID_ELEMENTS.has(tagName)) {
    return false;
  }
  // A self-closing slash is not permitted on non-void HTML elements: the spec
  // ignores it and the element stays open, so `<p />` is unclosed just like
  // `<div />` - the optional-end-tag rules do not rescue explicit `/>` syntax.
  if (explicitlySelfClosed) {
    return true;
  }
  // Own-property lookup: a plain index would resolve Object.prototype members,
  // so `<constructor>` or `<tostring>` would find a truthy "rule" and be
  // exempted even though they are not optional-end-tag elements.
  const rule = Object.prototype.hasOwnProperty.call(OPTIONAL_END_TAG_RULES, tagName)
    ? OPTIONAL_END_TAG_RULES[tagName]
    : undefined;
  if (rule) {
    const { nextElement, hasMoreContent, previous } = getFollowingContext(element);
    if (tagName === 'p' && hasUnclosedParagraphInLink(element, previous)) {
      return true;
    }
    return !rule(nextElement, hasMoreContent);
  }
  return true;
}

// Iterative pre-order DFS, like findFirstElement but also traversing template
// content: parse5 stores a template's descendants in its content fragment
// rather than its childNodes, so a walker that only follows childNodes never
// sees elements inside a <template>.
function findFirstUnclosedElement(root: HtmlNode, input: string): HtmlElement | undefined {
  const stack: HtmlNode[] = [root];
  while (stack.length > 0) {
    const current = stack.pop() as HtmlNode;
    if (isElementNode(current)) {
      if (isUnclosedElement(current, input)) {
        return current;
      }
      if (current.tagName === 'template' && 'content' in current) {
        stack.push((current as unknown as { content: HtmlNode }).content);
      }
    }
    const children = getChildNodes(current);
    // Push in reverse so pop() yields document order.
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
  return undefined;
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

  const unclosedElement = findFirstUnclosedElement(document, trimmed);
  if (unclosedElement) {
    return {
      isValid: false,
      reason: `Element <${unclosedElement.tagName}> is not closed`,
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
