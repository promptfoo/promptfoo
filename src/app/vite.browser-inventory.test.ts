// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';
import { afterEach, expect, it } from 'vitest';
import { browserInventoryPlugin } from './vite.browser-inventory';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

it.each([false, true])(
  'inventories emitted assets and analytics configuration (%s)',
  async (posthogKeyPresent) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-inventory-'));
    directories.push(root);
    const files: Record<string, string> = {
      'index.html': '<script type="module" src="/main.js"></script>',
      'main.js':
        'import { unused } from "unused"; import { value } from "used"; import "styles/style.css"; console.log(value);',
      'node_modules/used/package.json':
        '{"name":"used","version":"1.0.0","type":"module","main":"index.js","sideEffects":false}',
      'node_modules/used/index.js': 'export const value = "used fixture";',
      'node_modules/unused/package.json':
        '{"name":"unused","version":"2.0.0","type":"module","main":"index.js","sideEffects":false}',
      'node_modules/unused/index.js': 'export const unused = "unused fixture";',
      'node_modules/styles/package.json': '{"name":"styles","version":"3.0.0"}',
      'node_modules/styles/style.css': 'body { color: red; }',
      'public/copied.svg': '<svg></svg>',
    };
    for (const [file, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), content);
    }
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [browserInventoryPlugin({ posthogKeyPresent })],
      build: { sourcemap: true },
    });
    const inventory = JSON.parse(
      await fs.readFile(path.join(root, 'dist/browser-inventory.json'), 'utf8'),
    );
    expect(inventory.components).toEqual([
      { name: 'styles', version: '3.0.0' },
      { name: 'used', version: '1.0.0' },
    ]);
    expect(inventory.buildConfiguration).toEqual({ posthogKeyPresent });
    expect(inventory.assets).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'copied.svg' })]),
    );
    expect(inventory.assets.some((asset: { path: string }) => asset.path.endsWith('.css'))).toBe(
      true,
    );
    expect(inventory.assets.some((asset: { path: string }) => asset.path.endsWith('.map'))).toBe(
      false,
    );
  },
);
