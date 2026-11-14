import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveJavaScriptFileFunction } from '../../src/assertions/utils';
import { clearCjsModuleCache, importModule } from '../../src/esm';

describe('JavaScript file graders with the real module loader', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-grader-receiver-'));
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  });

  afterEach(() => {
    clearCjsModuleCache();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    {
      name: 'CommonJS named method',
      filename: 'grader.cjs',
      source: `module.exports = {
        expected: 'hello',
        grade(output) { return output === this.expected; },
      };`,
      functionName: 'grade',
    },
    {
      name: 'CommonJS named method alongside a default export',
      filename: 'grader.cjs',
      source: `module.exports = {
        expected: 'hello',
        default() { return false; },
        grade(output) { return output === this.expected; },
      };`,
      functionName: 'grade',
    },
    {
      name: 'ESM default-object named method',
      filename: 'grader.mjs',
      source: `export default {
        expected: 'hello',
        grade(output) { return output === this.expected; },
      };`,
      functionName: 'grade',
    },
    {
      name: 'transpiled default-object named method',
      filename: 'grader.cjs',
      source: `Object.defineProperty(exports, '__esModule', { value: true });
        exports.default = {
          expected: 'hello',
          grade(output) { return output === this.expected; },
        };`,
      functionName: 'grade',
    },
    {
      name: 'CommonJS unnamed default method',
      filename: 'grader.cjs',
      source: `module.exports = {
        expected: 'hello',
        default(output) { return output === this.expected; },
      };`,
      functionName: undefined,
    },
    {
      name: 'CommonJS fallback inside an ESM package',
      filename: 'grader.js',
      source: `module.exports = {
        expected: 'hello',
        grade(output) { return output === this.expected; },
      };`,
      functionName: 'grade',
    },
    {
      name: 'TypeScript default-object named method',
      filename: 'grader.ts',
      source: `export default {
        expected: 'hello',
        grade(output: string) { return output === this.expected; },
      };`,
      functionName: 'grade',
    },
  ])('preserves the receiver of a $name', async ({ filename, source, functionName }) => {
    const filePath = path.join(directory, filename);
    fs.writeFileSync(filePath, source);

    const grade = await resolveJavaScriptFileFunction(filePath, functionName);

    expect(await grade('hello', {})).toBe(true);
    expect(await grade('different', {})).toBe(false);
  });

  it.each([
    {
      filename: 'grader.mjs',
      source: `export default function(output) {
        return this === undefined && output === 'hello';
      }`,
    },
    {
      filename: 'grader.cjs',
      source: `'use strict';
        module.exports = function(output) {
          return this === undefined && output === 'hello';
        };`,
    },
  ])('keeps a standalone $filename function unbound', async ({ filename, source }) => {
    const filePath = path.join(directory, filename);
    fs.writeFileSync(filePath, source);

    const grade = await resolveJavaScriptFileFunction(filePath, undefined);

    expect(await grade('hello', {})).toBe(true);
  });

  it('keeps functions in a re-exported ESM namespace unbound', () => {
    const utilsUrl = pathToFileURL(path.resolve(__dirname, '../../src/assertions/utils.ts')).href;
    const barrel = path.join(directory, 'barrel.mjs');
    fs.writeFileSync(
      path.join(directory, 'grader.mjs'),
      'export function grade() { return this === undefined; } export default grade;',
    );
    fs.writeFileSync(barrel, "export * as default from './grader.mjs';");
    const runner = path.join(directory, 'check.mjs');
    fs.writeFileSync(
      runner,
      `import { resolveJavaScriptFileFunction } from ${JSON.stringify(utilsUrl)};
       for (const name of [undefined, 'default', 'grade']) {
         const grade = await resolveJavaScriptFileFunction(${JSON.stringify(barrel)}, name);
         if (!grade()) process.exitCode = 1;
       }`,
    );
    execFileSync(process.execPath, ['--import', 'tsx', runner]);
  });

  it.each(['js', 'cjs'])(
    'keeps transpiled named functions and self aliases unbound in .%s',
    (extension) => {
      const utilsUrl = pathToFileURL(path.resolve(__dirname, '../../src/assertions/utils.ts')).href;
      for (const [source, names] of [
        [
          "Object.defineProperty(exports, '__esModule', { value: true }); exports.grade = grade;",
          ['grade'],
        ],
        ['module.exports = grade; module.exports.default = grade;', [undefined, 'default']],
      ] as const) {
        const filePath = path.join(directory, `standalone-${names.length}.${extension}`);
        fs.writeFileSync(
          filePath,
          `'use strict'; function grade() { return this === undefined; } ${source}`,
        );
        const runner = path.join(directory, 'check.mjs');
        fs.writeFileSync(
          runner,
          `import { resolveJavaScriptFileFunction } from ${JSON.stringify(utilsUrl)};
        for (const name of ${JSON.stringify(names)}) {
          const grade = await resolveJavaScriptFileFunction(${JSON.stringify(filePath)}, name ?? undefined);
          if (!grade()) process.exitCode = 1;
        }`,
        );
        const result = execFileSync(process.execPath, ['--import', 'tsx', runner], {
          encoding: 'utf8',
        });
        expect(result.trim()).toBe('');
      }
    },
  );

  it.each(['', 'export default () => false;\n'])(
    'keeps standalone named ESM exports unbound with default export %j',
    async (defaultExport) => {
      const filePath = path.join(directory, 'grader.mjs');
      fs.writeFileSync(
        filePath,
        `${defaultExport}export function grade(output) {
        return this === undefined && output === 'hello';
      }`,
      );

      const grade = await resolveJavaScriptFileFunction(filePath, 'grade');

      expect(await grade('hello', {})).toBe(true);
    },
  );

  it.each([
    { extension: 'cjs', functionName: undefined },
    { extension: 'js', functionName: undefined },
    { extension: 'js', functionName: 'default' },
  ])(
    'keeps a transpiled .$extension default unbound (export: $functionName)',
    ({ extension, functionName }) => {
      const filePath = path.join(directory, `transpiled-grader.${extension}`);
      fs.writeFileSync(
        filePath,
        `Object.defineProperty(exports, '__esModule', { value: true });
        exports.default = function(output) {
          'use strict';
          return this === undefined && output === 'hello';
        };`,
      );
      const utilsUrl = pathToFileURL(path.resolve(__dirname, '../../src/assertions/utils.ts')).href;

      // Vitest's interop can unwrap compiler-generated objects before our loader sees them.
      const result = execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '--eval',
          `import { resolveJavaScriptFileFunction } from ${JSON.stringify(utilsUrl)};
          const grade = await resolveJavaScriptFileFunction(${JSON.stringify(filePath)}, ${JSON.stringify(functionName)});
          console.log(JSON.stringify(await grade('hello')));`,
        ],
        { encoding: 'utf8' },
      );

      expect(JSON.parse(result.trim())).toBe(true);
    },
  );

  it.each([
    {
      filename: 'grader.mjs',
      source: `export default {
        expected: 'hello',
        grade(output) { return output === this.expected; },
      };`,
      cacheCjsFallback: false,
    },
    ...[false, true].map((cacheCjsFallback) => ({
      filename: 'grader.js',
      source: `'use strict'; module.exports = {
        expected: 'hello',
        grade(output) { return output === this.expected; },
      };`,
      cacheCjsFallback,
    })),
  ])(
    'keeps binding opt-in for $filename (CJS cache: $cacheCjsFallback)',
    async ({ filename, source, cacheCjsFallback }) => {
      const filePath = path.join(directory, filename);
      fs.writeFileSync(filePath, source);

      const unbound = await importModule(filePath, 'grade', { cacheCjsFallback });
      expect(() => unbound('hello')).toThrow(TypeError);

      const bound = await importModule(filePath, 'grade', {
        cacheCjsFallback,
        bindToModule: true,
      });
      expect(bound('hello')).toBe(true);
    },
  );

  it.each([
    { functionName: 'missing', source: 'module.exports = { grade() { return true; } };' },
    { functionName: 'grade', source: 'module.exports = { grade: true };' },
  ])('rejects an export that is not a grader function', async ({ functionName, source }) => {
    const filePath = path.join(directory, 'grader.cjs');
    fs.writeFileSync(filePath, source);

    await expect(resolveJavaScriptFileFunction(filePath, functionName)).rejects.toThrow(
      `must export a function named "${functionName}"`,
    );
  });
});
