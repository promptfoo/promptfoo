import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { BrowserInventory, listAssetPaths } from '../../scripts/browser-inventory.mjs';

const directories: string[] = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-inventory-'));
  directories.push(root);
  return root;
}

async function write(root: string, file: string, content: string) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), content);
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

describe('browser inventory', () => {
  it('deduplicates only selected module identities, preserving nested versions', async () => {
    const root = await fixture();
    await write(
      root,
      'node_modules/@scope/ui/package.json',
      '{"name":"@scope/ui","version":"1.0.0"}',
    );
    await write(root, 'node_modules/@scope/ui/esm/package.json', '{"type":"module"}');
    await write(
      root,
      'node_modules/parent/node_modules/@scope/ui/package.json',
      '{"name":"@scope/ui","version":"2.0.0"}',
    );
    await write(
      root,
      'node_modules/build-tool/package.json',
      '{"name":"build-tool","version":"3.0.0"}',
    );
    await write(root, 'dist/bundle.js', 'console.log("hello");');
    const inventory = new BrowserInventory('app');
    inventory.addModule(path.join(root, 'node_modules/@scope/ui/esm/index.js?commonjs'));
    inventory.addModule(path.join(root, 'node_modules/@scope/ui/other.js'));
    inventory.addModule(path.join(root, 'node_modules/parent/node_modules/@scope/ui/index.js'));
    inventory.addModule(path.join(root, 'src/index.ts'));
    inventory.addModule(`\0${root}/node_modules/virtual/index.js`);
    const report = await inventory.write(path.join(root, 'dist'));
    expect(report.components).toEqual([
      { name: '@scope/ui', version: '1.0.0' },
      { name: '@scope/ui', version: '2.0.0' },
    ]);
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it('hashes exact emitted bytes, excludes itself and maps, and records external references separately', async () => {
    const root = await fixture();
    await write(root, 'assets/app.js', 'λ');
    await write(root, 'assets/app.js.map', 'private sources');
    await write(root, 'browser-inventory.json', 'old report');
    const inventory = new BrowserInventory('site');
    inventory.addExternalResource('https://cdn.example.test/widget.js', 'widget.ts');
    const report = await inventory.write(root);
    expect(report.assets).toEqual([
      { path: 'assets/app.js', sha256: createHash('sha256').update('λ').digest('hex'), size: 2 },
    ]);
    expect(report.components).toEqual([]);
    expect(report.externalResources).toEqual([
      { url: 'https://cdn.example.test/widget.js', source: 'widget.ts' },
    ]);
    expect(await inventory.write(root)).toEqual(report);
  });

  it('fails instead of silently omitting unresolvable packages or escaping asset paths', async () => {
    const root = await fixture();
    const inventory = new BrowserInventory('app');
    expect(() => inventory.addModule(path.join(root, 'node_modules/missing/index.js'))).toThrow();
    await expect(inventory.write(root, { assetPaths: ['../secret'] })).rejects.toThrow(
      'Invalid browser asset path',
    );
    await fs.symlink(os.tmpdir(), path.join(root, 'linked-directory'), 'junction');
    await expect(listAssetPaths(root)).rejects.toThrow('non-regular browser asset');
  });
});
