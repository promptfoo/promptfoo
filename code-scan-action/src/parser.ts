/**
 * XML Parser with Sandwich Strategy
 *
 * Parses loose XML comments from LLM output using first-opener + last-closer strategy
 * to handle code blocks containing closing tags.
 */

/**
 * Intermediate representation of a comment parsed from XML format.
 * This is transformed into the final Comment structure (from shared/dto)
 * with proper finding/fix/severity fields.
 */
export interface ParsedCommentXml {
  file: string | null;
  line: number | null;
  body: string; // Raw XML body content
}

function sliceBetween(str: string, startIdx: number, endIdx: number): string | null {
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }
  return str.slice(startIdx, endIdx);
}

function firstOpenTag(
  str: string,
  tag: string,
): { openStart: number; openEnd: number; attrSrc: string } | null {
  const re = new RegExp(`<${tag}\\b[^>]*>`, 'i');
  const m = re.exec(str);
  if (!m) {
    return null;
  }
  const openStart = m.index;
  const openEnd = m.index + m[0].length; // index just after '>'
  const attrSrc = m[0].slice(tag.length + 1, -1); // stuff after <tag and before >
  return { openStart, openEnd, attrSrc };
}

function lastCloseTag(str: string, tag: string): number {
  const pat = `</${tag}>`;
  const idx = str.toLowerCase().lastIndexOf(pat.toLowerCase());
  return idx;
}

/**
 * Sandwich mode: take first opener + last closer within a scope.
 */
function extractSandwich(str: string, tag: string): string | null {
  const open = firstOpenTag(str, tag);
  if (!open) {
    return null;
  }
  const closeStart = lastCloseTag(str, tag);
  if (closeStart === -1 || closeStart < open.openEnd) {
    return null;
  }
  const inner = sliceBetween(str, open.openEnd, closeStart);
  return inner;
}

/**
 * Extract all <comment> blocks from <comments> wrapper
 */
export function extractComments(xmlish: string): ParsedCommentXml[] {
  const s = String(xmlish);

  // Extract content within <comments> wrapper (or use full string if no wrapper)
  const scope = /<comments\b[^>]*>([\s\S]*?)<\/comments>/i.exec(s)?.[1] ?? s;

  const commentRe = /<comment\b[^>]*>([\s\S]*?)<\/comment>/gi;
  const comments: ParsedCommentXml[] = [];
  let cm;

  while ((cm = commentRe.exec(scope))) {
    const block = cm[1];

    const file = extractSandwich(block, 'file');
    const line = extractSandwich(block, 'line');
    const body = extractSandwich(block, 'body');

    comments.push({
      file: file?.trim() ?? null,
      line: line != null && /^\s*\d+\s*$/.test(line) ? parseInt(line, 10) : null,
      body: body?.trim() ?? '',
    });
  }

  return comments;
}
