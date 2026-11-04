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
