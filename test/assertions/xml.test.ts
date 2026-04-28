import dedent from 'dedent';
import { XMLParser } from 'fast-xml-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { containsXml, validateXml } from '../../src/assertions/xml';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateXml', () => {
  it('should validate a simple valid XML string', () => {
    expect(validateXml('<root><child>Content</child></root>')).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should invalidate a malformed XML string', () => {
    expect(validateXml('<root><child>Content</child></root')).toEqual({
      isValid: false,
      reason: expect.stringContaining('XML parsing failed'),
    });
  });

  it('should validate XML with attributes', () => {
    expect(validateXml('<root><child id="1">Content</child></root>')).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate XML with namespaces', () => {
    expect(
      validateXml('<root xmlns:ns="http://example.com"><ns:child>Content</ns:child></root>'),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate when all required elements are present', () => {
    expect(
      validateXml(
        '<analysis><classification>T-shirt</classification><color>Red</color></analysis>',
        ['analysis.classification', 'analysis.color'],
      ),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should invalidate when a required element is missing', () => {
    expect(
      validateXml('<analysis><classification>T-shirt</classification></analysis>', [
        'analysis.classification',
        'analysis.color',
      ]),
    ).toEqual({
      isValid: false,
      reason: 'XML is missing required elements: analysis.color',
    });
  });

  it('should validate nested elements correctly', () => {
    expect(
      validateXml('<root><parent><child><grandchild>Content</grandchild></child></parent></root>', [
        'root.parent.child.grandchild',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should invalidate when a nested required element is missing', () => {
    expect(
      validateXml('<root><parent><child></child></parent></root>', [
        'root.parent.child.grandchild',
      ]),
    ).toEqual({
      isValid: false,
      reason: 'XML is missing required elements: root.parent.child.grandchild',
    });
  });

  it('should handle empty elements correctly', () => {
    expect(
      validateXml('<root><emptyChild></emptyChild><nonEmptyChild>Content</nonEmptyChild></root>', [
        'root.emptyChild',
        'root.nonEmptyChild',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate XML with multiple siblings', () => {
    expect(
      validateXml('<root><child>Content1</child><child>Content2</child></root>', ['root.child']),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should handle XML with CDATA sections', () => {
    expect(
      validateXml('<root><child><![CDATA[<p>This is CDATA content</p>]]></child></root>', [
        'root.child',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate XML with processing instructions', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="style.xsl"?><root><child>Content</child></root>';
    expect(validateXml(xml, ['root.child'])).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should handle XML with comments', () => {
    expect(
      validateXml('<root><!-- This is a comment --><child>Content</child></root>', ['root.child']),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate the example XML structure', () => {
    const xml = dedent`
      <analysis>
        <classification>T-shirt/top</classification>
        <color>White with black print</color>
        <features>Large circular graphic design on the front, resembling a smiley face or emoji</features>
        <style>Modern, casual streetwear</style>
        <confidence>9</confidence>
        <reasoning>The image clearly shows a short-sleeved garment with a round neckline, which is characteristic of a T-shirt. The large circular graphic on the front is distinctive and appears to be a stylized smiley face or emoji design, which is popular in contemporary casual fashion. The stark contrast between the white fabric and black print is very clear, leaving little room for misinterpretation. The style is unmistakably modern and aligned with current trends in graphic tees. My confidence is high (9) because all elements of the image are clear and consistent with a typical graphic T-shirt design.</reasoning>
      </analysis>
    `;
    expect(
      validateXml(xml, [
        'analysis.classification',
        'analysis.color',
        'analysis.features',
        'analysis.style',
        'analysis.confidence',
        'analysis.reasoning',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });
});

describe('containsXml', () => {
  it('should return true when valid XML is present', () => {
    const input = 'Some text <root><child>Content</child></root> more text';
    const result = containsXml(input);
    expect(result.isValid).toBe(true);
  });

  it('should return false when no XML is present', () => {
    const input = 'This is just plain text';
    expect(containsXml(input)).toEqual({
      isValid: false,
      reason: 'No XML content found in the output',
    });
  });

  it('should validate required elements', () => {
    const input = 'Text <root><child>Content</child></root> more';
    const result = containsXml(input, ['root.child']);
    expect(result.isValid).toBe(true);
  });

  it('should return false when required elements are missing', () => {
    const input = 'Text <root><child>Content</child></root> more';
    expect(containsXml(input, ['root.missing'])).toEqual({
      isValid: false,
      reason: 'No valid XML content found matching the requirements',
    });
  });

  it('should handle multiple XML fragments', () => {
    const input = '<root1>Content</root1> text <root2><child>More</child></root2>';
    const result = containsXml(input, ['root2.child']);
    expect(result.isValid).toBe(true);
  });

  it('should validate requirements across multiple XML fragments', () => {
    const input = '<xml1>content1</xml1> more text <xml2>content2</xml2>';
    const result = containsXml(input, ['xml1', 'xml2']);
    expect(result.isValid).toBe(true);
  });

  it('should find valid XML after earlier unclosed tags', () => {
    const input = 'Text <unclosed><root><child>Content</child></root>';
    const result = containsXml(input, ['root.child']);
    expect(result.isValid).toBe(true);
  });

  it('should find valid XML with non-ASCII element names', () => {
    const input = 'Text <élément>Content</élément> more';

    expect(containsXml(input, ['élément'])).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should ignore pseudo-closing tags inside comments when extracting candidates', () => {
    const input = '<root><!-- </root> --><child>Content</child></root>';

    expect(containsXml(input, ['root.child'])).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should ignore pseudo-closing tags inside CDATA when extracting candidates', () => {
    const input = '<root><![CDATA[</root>]]><child>Content</child></root>';

    expect(containsXml(input, ['root.child'])).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should keep required elements root-relative within a valid candidate', () => {
    const input = 'Text <wrapper><root><child>Content</child></root></wrapper>';

    expect(containsXml(input, ['root.child'])).toEqual({
      isValid: false,
      reason: 'No valid XML content found matching the requirements',
    });
  });

  it('should not parse every nested candidate when required elements are missing', () => {
    const parseSpy = vi.spyOn(XMLParser.prototype, 'parse');
    const input = `${'<a>'.repeat(1000)}${'</a>'.repeat(1000)}`;

    expect(containsXml(input, ['a.missing'])).toEqual({
      isValid: false,
      reason: 'No valid XML content found matching the requirements',
    });
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it('should reject malformed opening tag streams without catastrophic backtracking', () => {
    const input = '<a'.repeat(5000);

    expect(containsXml(input)).toEqual({
      isValid: false,
      reason: 'No XML content found in the output',
    });
  });

  it('should reject malformed comment streams without quadratic declaration scans', () => {
    const input = '<!--'.repeat(10000);

    expect(containsXml(input)).toEqual({
      isValid: false,
      reason: 'No XML content found in the output',
    });
  });
});
