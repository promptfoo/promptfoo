import { XMLParser } from 'fast-xml-parser';
import type { AssertionParams, GradingResult } from '../types';

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
        let current: any = parsedXml;
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
  const xmlRegex = /<\?xml.*?>[\s\S]*<\/[^>]+>|\S*<[^>]+>[\s\S]*<\/[^>]+>/;
  const xmlMatches = outputString.match(xmlRegex);

  if (!xmlMatches) {
    return { isValid: false, reason: 'No XML content found in the output' };
  }

  for (const xmlMatch of xmlMatches) {
    const { isValid, reason } = validateXml(xmlMatch, requiredElements);
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
