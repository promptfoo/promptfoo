import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';
import webpack from 'webpack';
import browserInventoryPlugin from './browser-inventory';
import type { LoadContext } from '@docusaurus/types';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

it('records concatenated client packages while excluding treeshaken and server-only modules', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-inventory-'));
  directories.push(root);
  const files: Record<string, string> = {
    'src/main.js':
      'import { unused } from "unused"; import { value } from "used"; import "./components/NewsletterForm.js"; import "./pages/docs/api-reference.js"; console.log(value);',
    'node_modules/used/package.json':
      '{"name":"used","version":"1.0.0","type":"module","main":"index.js","sideEffects":false}',
    'node_modules/used/index.js': 'export const value = "used fixture";',
    'node_modules/unused/package.json':
      '{"name":"unused","version":"2.0.0","type":"module","main":"index.js","sideEffects":false}',
    'node_modules/unused/index.js':
      'export const unused = "unused fixture"; const script = {}; script.src = "https://unused.example.test/script.js";',
    'node_modules/server-only/package.json':
      '{"name":"server-only","version":"3.0.0","main":"index.js"}',
    'node_modules/server-only/index.js': 'console.log("server only");',
    'static/copied.svg': '<svg></svg>',
    'src/pages/docs/api-reference.js':
      'const script = {}; script.src = "https://cdn.example.test/widget.js";',
    'src/components/NewsletterForm.js':
      'const script = {}; script.src = "https://newsletter.example.test/form.js";',
    'static/js/scripts.js':
      'const script = {}; script.src = "https://vector.example.test/pixel.js"; script.src = "https://dynamic.example.test/" + id + "/loader.js";',
    'static/js/consent.js': '',
  };
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), content);
  }
  const outDir = path.join(root, 'dist');
  const plugin = browserInventoryPlugin({
    siteDir: root,
    siteConfig: { staticDirectories: ['static'] },
  } as LoadContext);
  const configure = plugin.configureWebpack!;
  const clientConfig = configure({}, false, {} as never, undefined);
  expect(configure({}, true, {} as never, undefined)).toEqual({});
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({
      mode: 'production',
      context: root,
      entry: './src/main.js',
      output: { path: outDir, filename: 'app.js' },
      ...clientConfig,
    });
    compiler.run((error, stats) => {
      compiler.close((closeError) => {
        if (error || closeError || stats?.hasErrors()) {
          reject(error || closeError || new Error(stats?.toString()));
        } else {
          resolve();
        }
      });
    });
  });
  await fs.cp(path.join(root, 'static'), outDir, { recursive: true });
  await plugin.postBuild!({ outDir } as Parameters<NonNullable<typeof plugin.postBuild>>[0]);
  const inventory = JSON.parse(
    await fs.readFile(path.join(outDir, 'browser-inventory.json'), 'utf8'),
  );
  expect(inventory.components).toEqual([{ name: 'used', version: '1.0.0' }]);
  expect(inventory.assets.map((asset: { path: string }) => asset.path)).toEqual([
    'app.js',
    'copied.svg',
    'js/consent.js',
    'js/scripts.js',
  ]);
  expect(inventory.externalResources).toEqual([
    { url: 'https://cdn.example.test/widget.js', source: 'src/pages/docs/api-reference.js' },
    { url: 'https://newsletter.example.test/form.js', source: 'src/components/NewsletterForm.js' },
    { url: 'https://vector.example.test/pixel.js', source: 'static/js/scripts.js' },
  ]);
});
