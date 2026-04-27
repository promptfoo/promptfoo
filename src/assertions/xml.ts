import { XMLParser } from 'fast-xml-parser';

import type { AssertionParams, GradingResult } from '../types/index';

type XmlTag =
  | { kind: 'opening'; end: number }
  | { kind: 'closing'; end: number }
  | { kind: 'declaration'; end: number };

function isXmlNameStartChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_:]/.test(char);
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

function findDeclarationEnd(input: string, start: number): number {
  if (input.startsWith('<!--', start)) {
    const end = input.indexOf('-->', start + 4);
    return end === -1 ? -1 : end + 2;
  }

  if (input.startsWith('<![CDATA[', start)) {
    const end = input.indexOf(']]>', start + 9);
    return end === -1 ? -1 : end + 2;
  }

  return findTagEnd(input, start);
}

function readXmlTag(input: string, start: number): XmlTag | undefined {
  const nextChar = input[start + 1];

  if (nextChar === undefined) {
    return undefined;
  }

  if (nextChar === '!') {
    const end = findDeclarationEnd(input, start);
    return end === -1 ? undefined : { kind: 'declaration', end };
  }

  if (nextChar === '?') {
    const end = findTagEnd(input, start);
    return end === -1 ? undefined : { kind: 'declaration', end };
  }

  if (nextChar === '/') {
    if (!isXmlNameStartChar(input[start + 2])) {
      return undefined;
    }

    const end = findTagEnd(input, start);
    return end === -1 ? undefined : { kind: 'closing', end };
  }

  if (!isXmlNameStartChar(nextChar)) {
    return undefined;
  }

  const end = findTagEnd(input, start);
  if (end === -1) {
    return undefined;
  }

  return { kind: 'opening', end };
}

function extractXmlCandidate(outputString: string): string | undefined {
  let candidateStart: number | undefined;
  let candidateEnd: number | undefined;

  for (let i = 0; i < outputString.length; i++) {
    if (outputString[i] !== '<') {
      continue;
    }

    const tag = readXmlTag(outputString, i);
    if (!tag) {
      continue;
    }

    if (tag.kind === 'opening') {
      candidateStart ??= i;
    } else if (tag.kind === 'closing' && candidateStart !== undefined) {
      candidateEnd = tag.end + 1;
    }

    i = tag.end;
  }

  if (candidateStart === undefined || candidateEnd === undefined) {
    return undefined;
  }

  return outputString.slice(candidateStart, candidateEnd);
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
  const xmlCandidate = extractXmlCandidate(outputString);

  if (!xmlCandidate) {
    return { isValid: false, reason: 'No XML content found in the output' };
  }

  const { isValid, reason } = validateXml(xmlCandidate, requiredElements);
  if (isValid) {
    return { isValid: true, reason };
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
