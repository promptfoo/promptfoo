import { describe, expect, it } from 'vitest';
import { handleContainsHtml, handleIsHtml } from '../../src/assertions/html';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

const defaultParams = {
  baseType: 'contains-html' as const,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'test' },
  },
  output: 'test',
  providerResponse: { output: 'test' },
  test: {} as AtomicTestCase,
};

// Exactly 10 Mi UTF-16 code units; multibyte text distinguishes a byte limit.
const maxSizeHtml = `<div>${'😀'.repeat(5 * 1024 * 1024 - 6)}x</div>`;

describe('handleContainsHtml', () => {
  it('should pass when output contains HTML tags', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-html' },
      outputString: '<div>Hello World</div>',
      inverse: false,
    };

    const result = handleContainsHtml(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should fail when output does not contain HTML tags', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-html' },
      outputString: 'Just plain text without any HTML',
      inverse: false,
    };

    const result = handleContainsHtml(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to contain HTML content',
      assertion: params.assertion,
    });
  });

  it('should detect various HTML tags', () => {
    const htmlExamples = [
      '<p>paragraph</p>',
      '<a href="link">text</a>',
      '<img src="image.jpg" />',
      '<h1>heading</h1>',
      '<div class="container"><span>nested</span></div>',
      '<!DOCTYPE html><html><head><title>Test</title></head><body>Content</body></html>',
      'Some text with <strong>emphasis</strong> in it',
      '<input type="text" value="test" />',
      '<br />',
      '<table><tr><td>cell</td></tr></table>',
      '<div>Text with &amp; entity</div>',
      '<p>Multiple &nbsp; HTML &lt; entities &gt;</p>',
      '<custom-element attr="value">Web component</custom-element>',
      '<div data-id="123" class="test">Modern HTML</div>',
      '<!DOCTYPE html>',
      '<body',
      '<x></y>',
      '<custom />',
      '&amp;<!-- comment -->',
      maxSizeHtml,
    ];

    htmlExamples.forEach((html) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'contains-html' },
        outputString: html,
        inverse: false,
      };

      const result = handleContainsHtml(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });
  });

  it('should not detect false positives', () => {
    const nonHtmlExamples = [
      'Just plain text',
      '2 < 3 and 4 > 1',
      'email@example.com',
      'Math: a < b > c',
      '< div >', // space after < means it's not a valid HTML tag
      'Generic <example> text', // Single unpaired tag without HTML indicators
      'if (a<b) { return c>d; }', // Code with comparison operators
      'The price is <$50',
      'Email me at <john@example.com>',
      '<custom/>',
      '</custom>',
      ' class="value"',
      '&amp;&amp;',
      '<!-- a --><!-- b -->',
      maxSizeHtml + 'x',
      ' ' + maxSizeHtml,
    ];

    nonHtmlExamples.forEach((text) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'contains-html' },
        outputString: text,
        inverse: false,
      };

      const result = handleContainsHtml(params);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  it('should handle inverse assertion correctly', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-contains-html' },
      outputString: 'Just plain text',
      inverse: true,
    };

    const result = handleContainsHtml(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle inverse assertion when HTML is present', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-contains-html' },
      outputString: '<div>HTML content</div>',
      inverse: true,
    };

    const result = handleContainsHtml(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to not contain HTML content',
      assertion: params.assertion,
    });
  });

  it('should detect HTML even with attributes and complex structures', () => {
    const complexHtml = `
      <div class="container" id="main">
        <h1 style="color: red;">Title</h1>
        <p data-value="123">Paragraph with <a href="/link">link</a></p>
        <img src="image.jpg" alt="description" width="100" height="100" />
      </div>
    `;

    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-html' },
      outputString: complexHtml,
      inverse: false,
    };

    const result = handleContainsHtml(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should handle edge cases with minimal HTML indicators', () => {
    // These should pass - have multiple HTML indicators
    const minimalHtmlPasses = [
      '<div>&nbsp;</div>', // tag + entity
      '<!-- comment --><span>text</span>', // comment + tag
      '<br/><hr/>', // multiple self-closing tags
      'Text with <b>bold</b> and <i>italic</i>', // multiple paired tags
    ];

    minimalHtmlPasses.forEach((html) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'contains-html' },
        outputString: html,
        inverse: false,
      };

      const result = handleContainsHtml(params);
      expect(result.pass).toBe(true);
    });

    // These should fail - only one HTML indicator
    const minimalHtmlFails = [
      '<custom>', // single unpaired non-standard tag
      '&amp;', // just an entity
      '<!-- comment -->', // just a comment
    ];

    minimalHtmlFails.forEach((text) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'contains-html' },
        outputString: text,
        inverse: false,
      };

      const result = handleContainsHtml(params);
      expect(result.pass).toBe(false);
    });
  });
});

describe('handleIsHtml', () => {
  const verifyValidHtml = (html: string) => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: html,
      inverse: false,
    };

    const result = handleIsHtml(params);
    expect(result.pass).toBe(true);
  };

  it('should pass when output is valid HTML', () => {
    const validHtmlExamples = [
      '<div>Hello World</div>',
      '<!DOCTYPE html><html><head><title>Test</title></head><body>Content</body></html>',
      '<p>Simple paragraph</p>',
      '<div><span>Nested</span></div>',
      '<img src="test.jpg" />',
      '<br />',
      '<div class="test" id="main">Content</div>',
      '  <div>With whitespace</div>  ',
    ];

    validHtmlExamples.forEach((html) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: html,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });
  });

  it('should fail when output is not valid HTML', () => {
    const invalidHtmlExamples = [
      { output: 'Just plain text', reason: 'Output must be wrapped in HTML tags' },
      {
        output: 'Some text with <strong>HTML</strong> inside',
        reason: 'Output must be wrapped in HTML tags',
      },
      {
        output: 'Text before <div>HTML</div>',
        reason: 'Output must be wrapped in HTML tags',
      },
      { output: '<div>HTML</div> Text after', reason: 'Output must be wrapped in HTML tags' },
      {
        output: '<?xml version="1.0"?><root>XML</root>',
        reason: 'Output appears to be XML, not HTML',
      },
      { output: '', reason: 'Output is empty' },
      { output: '   ', reason: 'Output is empty' },
      { output: '<notarealtag>', reason: 'Output does not contain recognized HTML elements' },
      { output: '2 < 3 and 4 > 1', reason: 'Output must be wrapped in HTML tags' },
    ];

    invalidHtmlExamples.forEach(({ output, reason }) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: output,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe(reason);
    });
  });

  it('should handle inverse assertion correctly', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-is-html' },
      outputString: 'Just plain text',
      inverse: true,
    };

    const result = handleIsHtml(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle inverse assertion when HTML is present', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-is-html' },
      outputString: '<div>Valid HTML</div>',
      inverse: true,
    };

    const result = handleIsHtml(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Output is valid HTML',
      assertion: params.assertion,
    });
  });

  it('should accept HTML fragments', () => {
    const fragments = [
      '<div>Fragment without doctype</div>',
      '<h1>Title</h1><p>Paragraph</p>',
      '<ul><li>Item 1</li><li>Item 2</li></ul>',
      '<form><input type="text" /><button>Submit</button></form>',
    ];

    fragments.forEach(verifyValidHtml);
  });

  it('should reject mixed content', () => {
    const mixedContent = [
      'Here is some HTML: <div>test</div>',
      '<div>HTML</div> and some text',
      'Text <br /> more text',
    ];

    mixedContent.forEach((content) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: content,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass).toBe(false);
    });
  });

  it('should accept bare elements that parse5 hoists into head', () => {
    // parse5 places top-level <script>, <style>, <title> into an auto-created
    // <head>. The walker should still find them as user-provided elements.
    const headOnlyExamples = [
      '<script>const x = 1;</script>',
      '<style>body { color: red; }</style>',
      '<title>Page</title>',
    ];

    headOnlyExamples.forEach(verifyValidHtml);
  });

  it('should accept SVG and template wrappers', () => {
    const fragments = ['<svg><circle /></svg>', '<template><div>x</div></template>'];

    fragments.forEach(verifyValidHtml);
  });

  it('should accept custom elements', () => {
    const fragments = [
      '<custom-element data-id="123">Web component</custom-element>',
      '<CUSTOM-ELEMENT>Uppercase custom element</CUSTOM-ELEMENT>',
    ];

    fragments.forEach(verifyValidHtml);
  });

  it('should fail for unclosed elements, as the docs describe for incomplete HTML', () => {
    const unclosedExamples = [
      '<div>Unclosed div',
      '<!DOCTYPE html><html><body><main><h1>Title</h1><p>Truncated',
      '<span>unclosed inline',
      '<div />',
      '<p />',
      '<ul><li /></ul>',
      '<body/>',
      // Tag names colliding with Object.prototype members must not be exempted
      // by an inherited "rule".
      '<constructor><div></div>',
      '<tostring><div></div>',
    ];

    unclosedExamples.forEach((html) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: html,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/not closed/);
    });
  });

  it('should still pass void elements, optional end tags and SVG self-closing syntax', () => {
    const stillValid = [
      '<p>one<p>two',
      '<ul><li>a<li>b</ul>',
      '<table><tr><td>a<td>b</table>',
      '<table><thead><tr><th>x</th><tbody><tr><td>y</td></table>',
      '<p>x<div>y</div><span>z</span>',
      '<br>',
      '<img src="x.png">',
      '<svg><circle r="1"/></svg>',
      '<div>' + '<p>x'.repeat(20000) + '</div>',
    ];

    stillValid.forEach(verifyValidHtml);
  });

  it('should fail for unclosed foreign-content elements without self-closing syntax', () => {
    // Foreign content permits `/>` but not a missing end tag.
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: '<svg><circle></svg>',
      inverse: false,
    };

    const result = handleIsHtml(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not closed/);
  });

  it('should fail for unclosed elements inside a closed template', () => {
    // parse5 stores template descendants in its content fragment, so the walker
    // must follow it instead of only childNodes.
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: '<template><div>truncated</template>',
      inverse: false,
    };

    const result = handleIsHtml(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not closed/);
  });

  it('should match the spec tag-omission rules across systematic contexts', () => {
    // Each case: [html, expectedValid, note]. Contexts where parse5's insertion
    // modes normalize the omission away (e.g. a span nests inside an open <p>)
    // are asserted as valid on purpose, documenting the boundary.
    const cases: Array<[string, boolean, string]> = [
      // p: omissible before a block element or at end of parent.
      ['<div><p>a<div>b</div></div>', true, 'p before block'],
      ['<div><p>a</div>', true, 'p at end of parent'],
      ['<div><p>a</p><span>b</span></div>', true, 'explicit p'],
      ['<div><p>one<span>two</span></div>', true, 'span nests inside open p'],
      ['<p>x<div>y</div><span>z</span>', true, 'p followed by block, other element later'],
      ['<p>x<dialog>y</dialog>', true, 'p before dialog (in the spec list)'],
      ['<p>x<search>y</search>', true, 'p before search (in the spec list)'],
      // li: omissible before li or at end of parent.
      ['<ul><li>a<li>b</ul>', true, 'li before li'],
      ['<ul><li>a</ul>', true, 'li at end of parent'],
      ['<ul><li>a</li><li>b</li></ul>', true, 'explicit li'],
      // dt/dd: omissible before dt/dd or at end of parent.
      ['<dl><dt>a<dd>b</dl>', true, 'dt before dd'],
      ['<dl><dt>a</dl>', false, 'final dt requires an explicit end tag'],
      ['<del><p>x</del>', false, 'p at end of del'],
      ['<del><p>x</p></del>', true, 'explicit p at end of del'],
      ['<dl><dt>a</dt><dd>b</dd></dl>', true, 'explicit dt/dd'],
      // rt/rp: omissible before rt/rp or at end of parent.
      ['<ruby>x<rt>a<rp>b</ruby>', true, 'rt before rp'],
      ['<ruby>x<rt>a</rt><rp>b</rp></ruby>', true, 'explicit rt/rp'],
      // option/optgroup: omissible before option/optgroup or at end of parent.
      ['<select><option>a<option>b</select>', true, 'option before option'],
      ['<select><optgroup><option>a</select>', true, 'option/optgroup at end'],
      ['<select><option>a</option></select>', true, 'explicit option'],
      // thead: omissible only before tbody/tfoot.
      ['<table><thead><tr><th>x</th><tbody><tr><td>y</td></table>', true, 'thead before tbody'],
      ['<table><thead><tr><th>x</th></tr></table>', false, 'thead at end of table'],
      ['<table><thead><tr><th>x</th></tr></thead></table>', true, 'explicit thead'],
      // tbody: omissible before tbody/tfoot or at end of parent.
      [
        '<table><tbody><tr><td>a</td></tr><tbody><tr><td>b</td></tr></table>',
        true,
        'tbody before tbody',
      ],
      // tfoot: omissible only at end of parent.
      [
        '<table><tbody><tr><td>a</td></tr></tbody><tfoot><tr><td>b</td></tr></table>',
        true,
        'tfoot at end of table',
      ],
      // tr/td/th: omissible before same-family sibling or at end of parent.
      ['<table><tr><td>a<td>b</table>', true, 'td before td'],
      ['<table><thead><tr><th>a<th>b</thead></table>', true, 'th before th'],
      ['<table><tr><td>a</td></tr></table>', true, 'explicit tr/td'],
      // colgroup/caption: omissible when not followed by whitespace or a comment
      // (approximated as: followed by an element, or nothing follows).
      ['<table><colgroup><col><tr><td>x</td></tr></table>', true, 'colgroup before tr'],
      ['<table><colgroup><col></table>', true, 'colgroup at end'],
      ['<table><caption>cap<tr><td>x</td></tr></table>', true, 'caption before tr'],
      ['<table><caption>cap</table>', true, 'caption at end of table'],
      ['<table><caption>cap</caption><tr><td>x</td></tr></table>', true, 'explicit caption'],
      // template contents are traversed.
      ['<template><div>ok</div></template>', true, 'closed div in template'],
      // body end tag is omissible whenever not followed by a comment, even for
      // an explicitly started empty body (spec locks this boundary).
      ['<body>', true, 'empty explicit body'],
      ['<html><body>', true, 'empty explicit html and body'],
    ];

    cases.forEach(([html, expectedValid, note]) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: html,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass, `${note}: ${html}`).toBe(expectedValid);
    });
  });

  it('should fail when an optional end tag is omitted where the spec disallows it', () => {
    // A thead end tag is only omissible before tbody/tfoot, not before </table>.
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: '<table><thead><tr><th>x</th></tr></table>',
      inverse: false,
    };

    const result = handleIsHtml(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not closed/);
  });

  it('should reject doctype-only input', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: '<!DOCTYPE html>',
      inverse: false,
    };

    const result = handleIsHtml(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('Output does not contain recognized HTML elements');
  });

  it('should reject table foster-parented text', () => {
    // parse5 hoists stray text inside <table> out to <body> per HTML5 spec,
    // so the wrapper check must still catch it.
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: '<table>stray text<tr><td>x</td></tr></table>',
      inverse: false,
    };

    const result = handleIsHtml(params);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('Output must be wrapped in HTML tags');
  });

  it('should reject unknown tags that merely share a prefix with html/head/body', () => {
    // Regression: a substring check like input.includes('<head') false-positives
    // on `<headphones>`, causing the auto-injected <head> to be treated as
    // user-provided and the assertion to incorrectly pass.
    const prefixCollisions = [
      { input: '<headphones>plain text</headphones>', tag: 'headphones' },
      { input: '<bodyguard>x</bodyguard>', tag: 'bodyguard' },
      { input: '<htmlworld>x</htmlworld>', tag: 'htmlworld' },
      { input: '<headd>x</headd>', tag: 'headd' },
    ];

    prefixCollisions.forEach(({ input }) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: input,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Output does not contain recognized HTML elements');
    });
  });

  it('should still accept body variants regardless of trailing chars', () => {
    // Control cases for the wrapper detection fix — body followed by `>` or
    // whitespace must continue to count as user-declared body. `<body/>` is no
    // longer accepted: the self-closing slash is not permitted on non-void
    // elements, so it fails as unclosed like `<div />`.
    const bodyVariants = ['<body>x</body>', '<body attr="val">x</body>'];

    bodyVariants.forEach((input) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: input,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass).toBe(true);
    });
  });

  it('should reject incomplete or ignored wrapper tags', () => {
    const invalidWrappers = [
      { input: '<html', reason: 'Output does not contain recognized HTML elements' },
      { input: '<head', reason: 'Output does not contain recognized HTML elements' },
      { input: '<body', reason: 'Output does not contain recognized HTML elements' },
      { input: 'plain <body>', reason: 'Output must be wrapped in HTML tags' },
      { input: 'plain <body', reason: 'Output must be wrapped in HTML tags' },
    ];

    invalidWrappers.forEach(({ input, reason }) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'is-html' },
        outputString: input,
        inverse: false,
      };

      const result = handleIsHtml(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toBe(reason);
    });
  });

  it('should handle pathologically deep nesting without stack overflow', () => {
    // Nesting 15k unknown elements forces the iterative walker to actually
    // traverse the full depth: unknown tags fail `isUserProvidedElement`, so
    // `findFirstElement` cannot short-circuit until it reaches the <div> at
    // the leaf. A recursive walker blows V8's ~10-15k stack-frame limit here.
    const depth = 15_000;
    const deeplyNested = `${'<notatag>'.repeat(depth)}<div>leaf</div>${'</notatag>'.repeat(depth)}`;

    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: deeplyNested,
      inverse: false,
    };

    const result = handleIsHtml(params);
    expect(result.pass).toBe(true);
  });
  it.each([
    ['<div><a href="/"><p>x</a></div>', false],
    ['<div><a href="/"><p>x</p></a></div>', true],
    ['<div><p>x<a href="/">y</a></div>', true],
    ['<div><svg><circle r=1/></svg></div>', false],
    ['<div><svg><circle r="1"/></svg></div>', true],
  ])('validates source end tags for %s', (input, pass) => {
    const result = handleIsHtml({
      ...defaultParams,
      assertion: { type: 'is-html' },
      outputString: input,
      inverse: false,
    });
    expect(result.pass).toBe(pass);
  });
});
