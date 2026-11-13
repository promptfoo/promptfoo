import { createElement } from 'react';

import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// Use the same CommonJS entry point as the Open Graph image plugin.
const requireFromPlugin = createRequire(require.resolve('../plugins/docusaurus-plugin-og-image'));
const { default: satori } = requireFromPlugin('satori') as typeof import('satori');

it('keeps SVG markup in a background color inside the fill attribute', async () => {
  const color = 'red"/><path id="unexpected"/><rect fill="red';
  const element = createElement('div', {
    style: { width: 32, height: 32, backgroundColor: color },
  });

  const svg = await satori(element, { width: 32, height: 32, fonts: [] });
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');

  expect(document.querySelector('#unexpected')).toBeNull();
  expect(document.querySelector('rect[fill^="red"]')?.getAttribute('fill')).toBe(color);
});
