import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transform } from '../../src/util/transform';

describe('JavaScript file transforms with real modules', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-transform-export-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const context = { vars: {} };
  const mixedEsm = `
    export default () => 'default';
    export const chosen = (output) => output.toUpperCase();
  `;

  it.each([
    {
      name: 'ESM named export alongside a default function',
      extension: 'mjs',
      source: mixedEsm,
      suffix: ':chosen',
      expected: 'HELLO',
    },
    {
      name: 'existing default object member when the ESM namespace has the same name',
      extension: 'mjs',
      source: `
        export default { chosen: () => 'default member' };
        export const chosen = (output) => output.toUpperCase();
      `,
      suffix: ':chosen',
      expected: 'default member',
    },
    {
      name: 'ESM named export alongside a default object without that name',
      extension: 'mjs',
      source: `
        export default { other: () => 'default member' };
        export const chosen = (output) => output.toUpperCase();
      `,
      suffix: ':chosen',
      expected: 'HELLO',
    },
    {
      name: 'ESM named-only module',
      extension: 'mjs',
      source: 'export const chosen = (output) => output.toUpperCase();',
      suffix: ':chosen',
      expected: 'HELLO',
    },
    {
      name: 'ESM default function without a suffix',
      extension: 'mjs',
      source: mixedEsm,
      suffix: '',
      expected: 'default',
    },
    {
      name: 'ESM default-only function without a suffix',
      extension: 'mjs',
      source: 'export default (output) => output.toUpperCase();',
      suffix: '',
      expected: 'HELLO',
    },
    {
      name: 'ESM default object member',
      extension: 'mjs',
      source: 'export default { chosen: (output) => output.toUpperCase() };',
      suffix: ':chosen',
      expected: 'HELLO',
    },
    {
      name: 'CommonJS object member',
      extension: 'cjs',
      source: 'module.exports = { chosen: (output) => output.toUpperCase() };',
      suffix: ':chosen',
      expected: 'HELLO',
    },
    {
      name: 'CommonJS function property',
      extension: 'cjs',
      source: `
        module.exports = () => 'default';
        module.exports.chosen = (output) => output.toUpperCase();
      `,
      suffix: ':chosen',
      expected: 'HELLO',
    },
    {
      name: 'CommonJS default wrapper member',
      extension: 'cjs',
      source: 'module.exports = { default: { chosen: (output) => output.toUpperCase() } };',
      suffix: ':chosen',
      expected: 'HELLO',
    },
    {
      name: 'CommonJS function without a suffix',
      extension: 'cjs',
      source: 'module.exports = (output) => output.toUpperCase();',
      suffix: '',
      expected: 'HELLO',
    },
  ])('uses the $name', async ({ extension, source, suffix, expected }) => {
    const modulePath = path.join(tempDir, `transform.${extension}`);
    fs.writeFileSync(modulePath, source);

    await expect(transform(`file://${modulePath}${suffix}`, 'hello', context)).resolves.toBe(
      expected,
    );
  });

  it.each([
    { name: 'ESM default function', extension: 'mjs', source: mixedEsm, selected: 'missing' },
    {
      name: 'ESM default-only function',
      extension: 'mjs',
      source: "export default () => 'default';",
      selected: 'missing',
    },
    {
      name: 'CommonJS function',
      extension: 'cjs',
      source: "module.exports = () => 'default';",
      selected: 'missing',
    },
    {
      name: 'non-function ESM export',
      extension: 'mjs',
      source: "export default () => 'default'; export const chosen = 42;",
      selected: 'chosen',
    },
    {
      name: 'inherited CommonJS function property',
      extension: 'cjs',
      source: "module.exports = () => 'default';",
      selected: 'toString',
    },
  ])(
    'rejects a missing or invalid selected export from $name',
    async ({ extension, source, selected }) => {
      const modulePath = path.join(tempDir, `transform.${extension}`);
      fs.writeFileSync(modulePath, source);

      await expect(transform(`file://${modulePath}:${selected}`, 'hello', context)).rejects.toThrow(
        `specified function "${selected}"`,
      );
    },
  );

  it.each([
    {
      name: 'inline object members',
      source: `
        module.exports = {
          default: () => 'default',
          chosen: (output) => output.toUpperCase(),
        };
      `,
    },
    {
      name: 'shorthand object members',
      source: `
        const defaultFn = () => 'default';
        const chosen = (output) => output.toUpperCase();
        module.exports = { default: defaultFn, chosen };
      `,
    },
  ])('selects native CommonJS exports with $name', ({ source }) => {
    // Native Node does not synthesize named exports for every CJS object literal.
    const modulePath = path.join(tempDir, 'transform.cjs');
    const conflictPath = path.join(tempDir, 'conflict.cjs');
    const shadowPath = path.join(tempDir, 'shadow.cjs');
    fs.writeFileSync(modulePath, source);
    fs.writeFileSync(
      conflictPath,
      `module.exports = {
        default: { chosen: () => 'default member' },
        chosen: () => 'outer member',
      };`,
    );
    fs.writeFileSync(
      shadowPath,
      `const defaultFn = () => 'default';
      defaultFn.chosen = undefined;
      module.exports = { default: defaultFn, chosen: () => 'outer member' };`,
    );

    const script = `
      import assert from 'node:assert/strict';
      import { importModule } from './src/esm.ts';
      import { transform } from './src/util/transform.ts';
      const modulePath = ${JSON.stringify(modulePath)};
      const reference = 'file://' + modulePath;
      const context = { vars: {} };
      assert.equal(await transform(reference + ':chosen', 'hello', context), 'HELLO');
      assert.equal(await transform(reference + ':default', 'hello', context), 'default');
      assert.equal(await transform(reference, 'hello', context), 'default');
      assert.equal(typeof await importModule(modulePath, 'chosen'), 'function');
      assert.equal(typeof await importModule(modulePath, 'default'), 'function');
      for (const name of ['missing', 'toString']) {
        await assert.rejects(transform(reference + ':' + name, 'hello', context),
          new RegExp('specified function "' + name + '"'));
        assert.equal(await importModule(modulePath, name), undefined);
      }
      assert.equal(await transform('file://' + ${JSON.stringify(conflictPath)} + ':chosen',
        'hello', context), 'default member');
      assert.equal(await importModule(${JSON.stringify(shadowPath)}, 'chosen'), undefined);
      await assert.rejects(transform('file://' + ${JSON.stringify(shadowPath)} + ':chosen',
        'hello', context), /specified function "chosen"/);
    `;
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'state') },
      stdio: 'pipe',
    });
  });

  it('selects only own named functions through the native CommonJS VM fallback', () => {
    // Vitest transforms .js modules itself, so use native Node to exercise the fallback.
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}');
    const modulePath = path.join(tempDir, 'transform.js');
    fs.writeFileSync(
      modulePath,
      `
        require('node:fs');
        module.exports = () => 'default';
        module.exports.chosen = (output) => output.toUpperCase();
      `,
    );

    const script = `
      import assert from 'node:assert/strict';
      import { importModule } from './src/esm.ts';
      import { transform } from './src/util/transform.ts';
      const modulePath = ${JSON.stringify(modulePath)};
      const reference = 'file://' + modulePath;
      const context = { vars: {} };
      assert.equal(await transform(reference + ':chosen', 'hello', context), 'HELLO');
      assert.equal(await transform(reference, 'hello', context), 'default');
      for (const name of ['missing', 'toString']) {
        await assert.rejects(transform(reference + ':' + name, 'hello', context),
          new RegExp('specified function "' + name + '"'));
        assert.equal(await importModule(modulePath, name, { cacheCjsFallback: true }), undefined);
      }
      const first = await importModule(modulePath, undefined, { cacheCjsFallback: true });
      assert.equal(await importModule(modulePath, undefined, { cacheCjsFallback: true }), first);
      assert.equal(await importModule(modulePath, 'chosen', { cacheCjsFallback: true }), first.chosen);
    `;
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'state') },
      stdio: 'pipe',
    });
  });
});
