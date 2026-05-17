import { XMLParser } from 'fast-xml-parser';

import type { AssertionParams, GradingResult } from '../types/index';

type XmlTag =
  | { kind: 'opening'; start: number; end: number; name: string; selfClosing: boolean }
  | { kind: 'closing'; start: number; end: number; name: string }
  | { kind: 'declaration'; start: number; end: number };

type OpenXmlTag = { name: string; start: number };
type XmlCandidate = { start: number; end: number; parentStart?: number };
type XmlValidationResult = { isValid: boolean; reason: string; isWellFormed: boolean };

function getLastOpenTag(stack: OpenXmlTag[]): OpenXmlTag | undefined {
  return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

function getCodePointLength(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}

function isXmlNameStartCodePoint(codePoint: number | undefined): codePoint is number {
  return (
    codePoint !== undefined &&
    (codePoint === 0x3a ||
      codePoint === 0x5f ||
      (codePoint >= 0x41 && codePoint <= 0x5a) ||
      (codePoint >= 0x61 && codePoint <= 0x7a) ||
      (codePoint >= 0xc0 && codePoint <= 0xd6) ||
      (codePoint >= 0xd8 && codePoint <= 0xf6) ||
      (codePoint >= 0xf8 && codePoint <= 0x2ff) ||
      (codePoint >= 0x370 && codePoint <= 0x37d) ||
      (codePoint >= 0x37f && codePoint <= 0x1fff) ||
      (codePoint >= 0x200c && codePoint <= 0x200d) ||
      (codePoint >= 0x2070 && codePoint <= 0x218f) ||
      (codePoint >= 0x2c00 && codePoint <= 0x2fef) ||
      (codePoint >= 0x3001 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfdcf) ||
      (codePoint >= 0xfdf0 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0xeffff))
  );
}

function isXmlNameCodePoint(codePoint: number | undefined): codePoint is number {
  return (
    isXmlNameStartCodePoint(codePoint) ||
    codePoint === 0x2d ||
    codePoint === 0x2e ||
    (codePoint !== undefined && codePoint >= 0x30 && codePoint <= 0x39) ||
    codePoint === 0xb7 ||
    (codePoint !== undefined && codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint !== undefined && codePoint >= 0x203f && codePoint <= 0x2040)
  );
}

function readXmlName(input: string, start: number): { name: string; end: number } | undefined {
  const firstCodePoint = input.codePointAt(start);
  if (!isXmlNameStartCodePoint(firstCodePoint)) {
    return undefined;
  }

  let end = start + getCodePointLength(firstCodePoint);
  for (let codePoint = input.codePointAt(end); isXmlNameCodePoint(codePoint); ) {
    end += getCodePointLength(codePoint);
    codePoint = input.codePointAt(end);
  }

  return { name: input.slice(start, end), end };
}

function findTagEnd(input: string, start: number): number {
  let quote: string | undefined;

  for (let i = start + 1; i < input.length; i++) {
    const char = input[i];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '<') {
      return -1;
    } else if (char === '>') {
      return i;
    }
  }

  return -1;
}

function findDelimitedDeclarationEnd(input: string, start: number, delimiter: string): number {
  for (let i = start; i <= input.length - delimiter.length; i++) {
    if (input.startsWith(delimiter, i)) {
      return i + delimiter.length - 1;
    }
  }

  return input.length - 1;
}

function findDeclarationEnd(input: string, start: number): number {
  if (input.startsWith('<!--', start)) {
    return findDelimitedDeclarationEnd(input, start + 4, '-->');
  }

  if (input.startsWith('<![CDATA[', start)) {
    return findDelimitedDeclarationEnd(input, start + 9, ']]>');
  }

  let quote: string | undefined;
  let bracketDepth = 0;

  for (let i = start + 2; i < input.length; i++) {
    const char = input[i];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '[') {
      bracketDepth++;
    } else if (char === ']' && bracketDepth > 0) {
      bracketDepth--;
    } else if (char === '>' && bracketDepth === 0) {
      return i;
    }
  }

  return input.length - 1;
}

function findProcessingInstructionEnd(input: string, start: number): number {
  return findDelimitedDeclarationEnd(input, start + 2, '?>');
}

function isSelfClosingTag(input: string, start: number, end: number): boolean {
  let lastNonWhitespace = end - 1;
  while (lastNonWhitespace > start && /\s/.test(input[lastNonWhitespace])) {
    lastNonWhitespace--;
  }
  return input[lastNonWhitespace] === '/';
}

function readXmlTag(input: string, start: number): XmlTag | undefined {
  const nextChar = input[start + 1];

  if (nextChar === undefined) {
    return undefined;
  }

  if (nextChar === '!') {
    return { kind: 'declaration', start, end: findDeclarationEnd(input, start) };
  }

  if (nextChar === '?') {
    return { kind: 'declaration', start, end: findProcessingInstructionEnd(input, start) };
  }

  if (nextChar === '/') {
    const name = readXmlName(input, start + 2);
    if (!name) {
      return undefined;
    }

    const end = findTagEnd(input, start);
    return end === -1 ? undefined : { kind: 'closing', start, end, name: name.name };
  }

  const name = readXmlName(input, start + 1);
  if (!name) {
    return undefined;
  }

  const end = findTagEnd(input, start);
  if (end === -1) {
    return undefined;
  }

  return {
    kind: 'opening',
    start,
    end,
    name: name.name,
    selfClosing: isSelfClosingTag(input, start, end),
  };
}

function orderXmlCandidates(candidates: XmlCandidate[]): XmlCandidate[] {
  const ordered: XmlCandidate[] = [];
  const seen = new Set<string>();
  const byParent = new Map<number | undefined, XmlCandidate[]>();
  const candidateStarts = new Set(candidates.map((candidate) => candidate.start));

  const addCandidate = (candidate: XmlCandidate) => {
    const key = `${candidate.start}:${candidate.end}`;
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(candidate);
    }
  };

  for (const candidate of candidates) {
    const siblings = byParent.get(candidate.parentStart);
    if (siblings) {
      siblings.push(candidate);
    } else {
      byParent.set(candidate.parentStart, [candidate]);
    }
  }

  for (const [parentStart, siblings] of byParent.entries()) {
    if (siblings.length <= 1 || (parentStart !== undefined && candidateStarts.has(parentStart))) {
      continue;
    }

    siblings.sort((a, b) => a.start - b.start || a.end - b.end);
    addCandidate({
      start: siblings[0].start,
      end: siblings[siblings.length - 1].end,
      parentStart,
    });
  }

  const maximalCandidates = candidates
    .filter(
      (candidate) =>
        candidate.parentStart === undefined || !candidateStarts.has(candidate.parentStart),
    )
    .sort((a, b) => a.start - b.start || b.end - a.end);

  for (const candidate of maximalCandidates) {
    addCandidate(candidate);
  }

  return ordered;
}

function extractXmlCandidates(outputString: string): XmlCandidate[] {
  const stack: OpenXmlTag[] = [];
  const candidates: XmlCandidate[] = [];

  for (let i = 0; i < outputString.length; i++) {
    if (outputString[i] !== '<') {
      continue;
    }

    const tag = readXmlTag(outputString, i);
    if (!tag) {
      continue;
    }

    if (tag.kind === 'opening') {
      if (tag.selfClosing) {
        candidates.push({
          start: tag.start,
          end: tag.end + 1,
          parentStart: getLastOpenTag(stack)?.start,
        });
      } else {
        stack.push({ name: tag.name, start: tag.start });
      }
    } else if (tag.kind === 'closing') {
      const openTag = getLastOpenTag(stack);
      if (openTag?.name === tag.name) {
        stack.pop();
        candidates.push({
          start: openTag.start,
          end: tag.end + 1,
          parentStart: getLastOpenTag(stack)?.start,
        });
      } else {
        stack.length = 0;
      }
    }

    i = tag.end;
  }

  return orderXmlCandidates(candidates);
}

function hasElementPath(value: unknown, path: string[]): boolean {
  let current = value;

  for (const key of path) {
    if (current === null || typeof current !== 'object') {
      return false;
    }

    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || String(index) !== key) {
        return false;
      }

      if (current[index] === undefined) {
        return false;
      }

      current = current[index];
      continue;
    }

    const record = current as Record<string, unknown>;
    if (record[key] === undefined) {
      return false;
    }

    current = record[key];
  }

  return true;
}

function getMissingElements(parsedXml: unknown, requiredElements: string[] | undefined): string[] {
  if (!requiredElements || requiredElements.length === 0) {
    return [];
  }

  return requiredElements.filter((element) => {
    const path = element.split('.');
    return !hasElementPath(parsedXml, path);
  });
}

function validateXmlCandidate(xmlString: string, requiredElements?: string[]): XmlValidationResult {
  if (!xmlString.startsWith('<')) {
    return { isValid: false, reason: 'XML is missing opening tag', isWellFormed: false };
  }

  const parser = new XMLParser({
    allowBooleanAttributes: true,
    ignoreAttributes: false,
    parseAttributeValue: true,
    parseTagValue: true,
  });

  try {
    const parsedXml = parser.parse(xmlString);
    const missingElements = getMissingElements(parsedXml, requiredElements);

    if (missingElements.length > 0) {
      return {
        isValid: false,
        reason: `XML is missing required elements: ${missingElements.join(', ')}`,
        isWellFormed: true,
      };
    }

    return {
      isValid: true,
      reason: 'XML is valid and contains all required elements',
      isWellFormed: true,
    };
  } catch (err) {
    return {
      isValid: false,
      reason: `XML parsing failed: ${(err as Error).message}`,
      isWellFormed: false,
    };
  }
}

export function validateXml(
  xmlString: string,
  requiredElements?: string[],
): { isValid: boolean; reason: string } {
  const result = validateXmlCandidate(xmlString, requiredElements);
  return { isValid: result.isValid, reason: result.reason };
}

export function containsXml(
  outputString: string,
  requiredElements?: string[],
): { isValid: boolean; reason: string } {
  const xmlCandidates = extractXmlCandidates(outputString);
  const wellFormedContainers: XmlCandidate[] = [];

  if (xmlCandidates.length === 0) {
    return { isValid: false, reason: 'No XML content found in the output' };
  }

  for (const xmlCandidate of xmlCandidates) {
    if (
      wellFormedContainers.some(
        (container) => xmlCandidate.start >= container.start && xmlCandidate.end <= container.end,
      )
    ) {
      continue;
    }

    const { isValid, isWellFormed, reason } = validateXmlCandidate(
      outputString.slice(xmlCandidate.start, xmlCandidate.end),
      requiredElements,
    );
    if (isValid) {
      return { isValid: true, reason };
    }
    if (isWellFormed) {
      wellFormedContainers.push(xmlCandidate);
    }
  }

  return { isValid: false, reason: 'No valid XML content found matching the requirements' };
}

export const handleIsXml = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
  baseType,
}: AssertionParams): GradingResult => {
  let requiredElements: string[] | undefined;
  if (typeof renderedValue === 'string') {
    requiredElements = renderedValue.split(',').map((el) => el.trim());
  } else if (Array.isArray(renderedValue) && renderedValue.length > 0) {
    requiredElements = renderedValue.map((el) => el.toString());
  } else if (
    renderedValue !== null &&
    typeof renderedValue === 'object' &&
    Object.keys(renderedValue).length > 0
  ) {
    if ('requiredElements' in renderedValue && Array.isArray(renderedValue.requiredElements)) {
      requiredElements = renderedValue.requiredElements.map((el) => el.toString());
    } else {
      throw new Error('xml assertion must contain a string, array value, or no value');
    }
  }

  const result = (baseType === 'is-xml' ? validateXml : containsXml)(
    outputString,
    requiredElements,
  );
  const pass = result.isValid !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : result.reason,
    assertion,
  };
};
