import { XMLParser } from 'fast-xml-parser';

import type { AssertionParams, GradingResult } from '../types/index';

type XmlTag =
  | { kind: 'opening'; start: number; end: number; name: string; selfClosing: boolean }
  | { kind: 'closing'; start: number; end: number; name: string }
  | { kind: 'declaration'; start: number; end: number };

type OpenXmlTag = { name: string; start: number };
type XmlCandidate = { start: number; end: number; parentStart?: number };

function getLastOpenTag(stack: OpenXmlTag[]): OpenXmlTag | undefined {
  return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

function isXmlNameStartChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_:]/.test(char);
}

function isXmlNameChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_.:-]/.test(char);
}

function readXmlName(input: string, start: number): { name: string; end: number } | undefined {
  if (!isXmlNameStartChar(input[start])) {
    return undefined;
  }

  let end = start + 1;
  while (isXmlNameChar(input[end])) {
    end++;
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
    const end = findTagEnd(input, start);
    return end === -1 ? undefined : { kind: 'declaration', start, end };
  }

  if (nextChar === '?') {
    const end = findTagEnd(input, start);
    return end === -1 ? undefined : { kind: 'declaration', start, end };
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

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.start - b.start || a.end - b.end);
    addCandidate({
      start: siblings[0].start,
      end: siblings[siblings.length - 1].end,
    });
  }

  for (const candidate of candidates) {
    addCandidate(candidate);
  }

  return ordered;
}

function extractXmlCandidates(outputString: string): string[] {
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

  return orderXmlCandidates(candidates).map((candidate) =>
    outputString.slice(candidate.start, candidate.end),
  );
}

export function validateXml(
  xmlString: string,
  requiredElements?: string[],
): { isValid: boolean; reason: string } {
  if (!xmlString.startsWith('<')) {
    return { isValid: false, reason: 'XML is missing opening tag' };
  }
  const parser = new XMLParser({
    allowBooleanAttributes: true,
    ignoreAttributes: false,
    parseAttributeValue: true,
    parseTagValue: true,
  });

  try {
    const parsedXml = parser.parse(xmlString);
    if (requiredElements && requiredElements.length > 0) {
      const missingElements = requiredElements.filter((element) => {
        const path = element.split('.');
        let current = parsedXml;
        for (const key of path) {
          if (current[key] === undefined) {
            return true;
          }
          current = current[key];
        }
        return false;
      });

      if (missingElements.length > 0) {
        return {
          isValid: false,
          reason: `XML is missing required elements: ${missingElements.join(', ')}`,
        };
      }
    }

    return { isValid: true, reason: 'XML is valid and contains all required elements' };
  } catch (err) {
    return { isValid: false, reason: `XML parsing failed: ${(err as Error).message}` };
  }
}

export function containsXml(
  outputString: string,
  requiredElements?: string[],
): { isValid: boolean; reason: string } {
  const xmlCandidates = extractXmlCandidates(outputString);

  if (xmlCandidates.length === 0) {
    return { isValid: false, reason: 'No XML content found in the output' };
  }

  for (const xmlCandidate of xmlCandidates) {
    const { isValid, reason } = validateXml(xmlCandidate, requiredElements);
    if (isValid) {
      return { isValid: true, reason };
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
