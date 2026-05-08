import { describe, expect, it } from 'vitest';
import { extractModuleSpecifiers, resolveRelativeModule } from '../../scripts/architectureUtils';

describe('extractModuleSpecifiers', () => {
  it('collects static ESM and CommonJS module specifiers', () => {
    const source = `
      import imported from 'esm-import';
      export { exported } from 'esm-export';
      import('dynamic-import');
      const required = require('cjs-require');
      const resolved = require.resolve('cjs-resolve');
      require(nonLiteral);
    `;

    expect(extractModuleSpecifiers(source, 'fixture.ts')).toEqual([
      'esm-import',
      'esm-export',
      'dynamic-import',
      'cjs-require',
      'cjs-resolve',
    ]);
  });
});

describe('resolveRelativeModule', () => {
  it('maps runtime .js specifiers back to TypeScript source files', () => {
    expect(
      resolveRelativeModule(process.cwd(), 'src/server/routes/eval.ts', '../../index.js'),
    ).toBe('src/index.ts');
  });
});
