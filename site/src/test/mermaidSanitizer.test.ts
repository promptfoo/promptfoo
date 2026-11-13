import { createRequire } from 'node:module';

import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DOMPurify, WindowLike } from 'dompurify';

const require = createRequire(import.meta.url);
const themeRequire = createRequire(require.resolve('@docusaurus/theme-mermaid'));
const mermaidRequire = createRequire(themeRequire.resolve('mermaid'));
// Exercise the sanitizer used by the docs renderer, including a hoisted copy.
const createDOMPurify = mermaidRequire('dompurify') as DOMPurify;

describe('the docs Mermaid sanitizer', () => {
  let dom: JSDOM;
  let purify: DOMPurify;

  beforeEach(() => {
    dom = new JSDOM();
    purify = createDOMPurify(dom.window as unknown as WindowLike);
  });

  afterEach(() => {
    purify.removeAllHooks();
    dom.window.close();
  });

  it('preserves harmless label markup and removes executable attributes', () => {
    expect(purify.sanitize('<b>safe label</b><img src="x" onerror="void 0">')).toBe(
      '<b>safe label</b><img src="x">',
    );
  });

  it.each(['href', 'opacity'])('sanitizes SVG animation targeting %s in XHTML', (attributeName) => {
    const values = attributeName === 'href' ? 'x;javascript:alert(1)' : '0;1';
    const output = purify.sanitize(
      `<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="${attributeName}" values="${values}"/><text>label</text></a></svg>`,
      {
        PARSER_MEDIA_TYPE: 'application/xhtml+xml',
        USE_PROFILES: { svg: true },
        ADD_TAGS: ['animate'],
        ADD_ATTR: ['attributeName', 'values'],
      },
    );
    const document = new dom.window.DOMParser().parseFromString(output, 'application/xhtml+xml');

    expect(document.querySelector('animate')?.getAttribute('attributeName')).toBe(
      attributeName === 'href' ? null : 'opacity',
    );
    expect(document.querySelector('text')?.textContent).toBe('label');
  });

  it.each([
    'afterSanitizeElements',
    'beforeSanitizeAttributes',
    'afterSanitizeAttributes',
  ] as const)('sanitizes descendants detached by the %s hook', (hook) => {
    const root = dom.window.document.createElement('div');
    root.innerHTML =
      '<section id="wrap"><img id="tail" onerror="void 0"></section><span>safe</span>';
    const tail = root.querySelector('#tail')!;
    purify.addHook(hook, (node) => {
      if (node instanceof dom.window.Element && node.id === 'wrap') {
        node.remove();
      }
    });

    // Detached nodes can be retained and reinserted by the caller.
    expect(purify.sanitize(root, { IN_PLACE: true })).toBe(root);
    expect(root.querySelector('#wrap')).toBeNull();
    expect(tail.getAttribute('onerror')).toBeNull();
    expect(root.querySelector('span')?.textContent).toBe('safe');
  });

  it('removes template expressions joined across a removed shadow-root child', () => {
    const host = dom.window.document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append(
      dom.window.document.createTextNode('safe $'),
      dom.window.document.createElement('object'),
      dom.window.document.createTextNode('{alert(1)}'),
    );

    expect(purify.sanitize(host, { IN_PLACE: true, SAFE_FOR_TEMPLATES: true })).toBe(host);
    expect(shadow.querySelector('object')).toBeNull();
    expect(shadow.textContent).not.toContain('${alert(1)}');
    expect(shadow.textContent).toContain('safe');
  });

  it('sanitizes an unvisited sibling detached by a hook on another node', () => {
    const root = dom.window.document.createElement('div');
    root.innerHTML =
      '<span id="trigger">safe</span><section id="detached"><img onerror="void 0"></section>';
    const detached = root.querySelector('#detached')!;
    const image = detached.querySelector('img')!;
    purify.addHook('afterSanitizeElements', (node) => {
      if (node instanceof dom.window.Element && node.id === 'trigger') {
        detached.remove();
      }
    });

    expect(purify.sanitize(root, { IN_PLACE: true })).toBe(root);
    expect(root.querySelector('#detached')).toBeNull();
    expect(image.getAttribute('onerror')).toBeNull();
    expect(root.querySelector('span')?.textContent).toBe('safe');
  });

  it('rejects an in-place raw-text root that sanitization removes', () => {
    const root = dom.window.document.createElement('style');
    root.textContent = '</style><img src=x onerror=1>';
    dom.window.document.body.append(root);

    expect(() => purify.sanitize(root, { IN_PLACE: true })).toThrow(
      /refusing to sanitize in place/i,
    );
    expect(purify.removed.some((removed) => removed.element === root)).toBe(true);
  });

  it('keeps a safe in-place root when a dangerous child is removed', () => {
    const root = dom.window.document.createElement('div');
    const style = dom.window.document.createElement('style');
    style.textContent = '</style><img src=x onerror=1>';
    const safe = dom.window.document.createElement('span');
    safe.textContent = 'safe';
    root.append(style, safe);
    dom.window.document.body.append(root);

    expect(purify.sanitize(root, { IN_PLACE: true })).toBe(root);
    expect(root.querySelector('style')).toBeNull();
    expect(root.querySelector('span')).toBe(safe);
    expect(safe.textContent).toBe('safe');
  });
});

describe('the docs Mermaid math renderer', () => {
  const katex = mermaidRequire('katex') as {
    renderToString(input: string, options?: { trust?: boolean }): string;
  };

  it('does not inherit trusted rendering from the options prototype', () => {
    const options = Object.create({ trust: true });
    const output = katex.renderToString(String.raw`\href{javascript:alert(1)}{unsafe}`, options);

    expect(output).not.toContain('href="javascript:');
    expect(output).toContain('unsafe');
  });

  it('preserves explicitly trusted links', () => {
    const output = katex.renderToString(String.raw`\href{https://example.com}{safe}`, {
      trust: true,
    });

    expect(output).toContain('href="https://example.com"');
  });
});
