import { XMLParser } from 'fast-xml-parser';

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
