import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractModuleSpecifiers,
  findViolations,
  type LayerConfig,
  resolveInternalModule,
} from '../../scripts/architectureUtils';

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

describe('resolveInternalModule', () => {
  it('maps runtime .js specifiers back to TypeScript source files', () => {
    expect(
      resolveInternalModule(process.cwd(), 'src/server/routes/eval.ts', '../../index.js'),
    ).toBe('src/index.ts');
  });

  it('resolves baseUrl-style src imports so they cannot bypass layer checks', () => {
    expect(resolveInternalModule(process.cwd(), 'src/contracts/index.ts', 'src/index.js')).toBe(
      'src/index.ts',
    );
  });

  describe('edge cases (against synthesized fixture trees)', () => {
    let repoRoot: string;

    beforeEach(() => {
      repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archutils-'));
    });

    afterEach(() => {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    });

    function write(relativePath: string, contents = ''): void {
      const absolute = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, contents);
    }

    it('resolves bare "src" specifier to src/index.ts', () => {
      write('src/index.ts');
      expect(resolveInternalModule(repoRoot, 'scripts/check.ts', 'src')).toBe('src/index.ts');
    });

    it('resolves directory imports to index.ts', () => {
      write('src/contracts/index.ts');
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', './contracts')).toBe(
        'src/contracts/index.ts',
      );
    });

    it('resolves directory index for .tsx', () => {
      write('src/components/index.tsx');
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', './components')).toBe(
        'src/components/index.tsx',
      );
    });

    it('maps .mjs specifiers to .mts source files', () => {
      write('src/foo.mts');
      expect(resolveInternalModule(repoRoot, 'src/bar.ts', './foo.mjs')).toBe('src/foo.mts');
    });

    it('maps .cjs specifiers to .cts source files', () => {
      write('src/foo.cts');
      expect(resolveInternalModule(repoRoot, 'src/bar.ts', './foo.cjs')).toBe('src/foo.cts');
    });

    it('resolves .tsx source for runtime .js when both .ts and .tsx are absent', () => {
      write('src/component.tsx');
      expect(resolveInternalModule(repoRoot, 'src/index.ts', './component.js')).toBe(
        'src/component.tsx',
      );
    });

    it('returns undefined for non-existent internal paths', () => {
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', './missing')).toBeUndefined();
    });

    it('returns undefined for external (non-relative, non-src) specifiers', () => {
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', 'zod')).toBeUndefined();
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', '@scoped/pkg')).toBeUndefined();
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', 'node:fs')).toBeUndefined();
    });

    it('prefers a file over a directory when both could match', () => {
      write('src/index.ts', '// file');
      write('src/index/index.ts', '// directory');
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', '../src/index')).toBe('src/index.ts');
    });
  });
});

describe('findViolations', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'findviolations-'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents = ''): void {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }

  function configWithLeaf(leafLayers: string[] = ['leaf']): LayerConfig {
    return {
      publicFacade: 'src/index.ts',
      leafLayers,
      layers: [
        { name: 'facade', roots: ['src/index.ts'] },
        { name: 'leaf', roots: ['src/leaf'] },
        { name: 'core', roots: ['src/core'] },
      ],
    };
  }

  it('returns empty when nothing imports anything internal', () => {
    write('src/index.ts', '// barrel');
    write('src/leaf/a.ts', "import { z } from 'zod';");

    expect(findViolations(repoRoot, configWithLeaf())).toEqual([]);
  });

  it('flags a leaf-layer file importing from another product layer', () => {
    write('src/index.ts');
    write('src/core/util.ts', 'export const x = 1;');
    write('src/leaf/a.ts', "import { x } from '../core/util';");

    const violations = findViolations(repoRoot, configWithLeaf());
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      kind: 'leaf',
      importer: 'src/leaf/a.ts',
      importerLayer: 'leaf',
      imported: 'src/core/util.ts',
      importedLayer: 'core',
    });
  });

  it('does not flag intra-leaf imports', () => {
    write('src/index.ts');
    write('src/leaf/a.ts', "import { y } from './b';");
    write('src/leaf/b.ts', 'export const y = 2;');

    expect(findViolations(repoRoot, configWithLeaf())).toEqual([]);
  });

  it('flags a non-facade file importing the public facade', () => {
    write('src/index.ts', "export const facade = 'me';");
    write('src/core/util.ts', "import { facade } from '../index';");

    const violations = findViolations(repoRoot, configWithLeaf());
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      kind: 'facade',
      importer: 'src/core/util.ts',
      importerLayer: 'core',
    });
  });

  it('flags both facade and leaf when a leaf imports the public facade', () => {
    write('src/index.ts', "export const facade = 'me';");
    write('src/leaf/a.ts', "import { facade } from '../index';");

    const violations = findViolations(repoRoot, configWithLeaf());
    const kinds = violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(['facade', 'leaf']);
  });

  it('returns empty when leafLayers is unset (only facade rule applies)', () => {
    write('src/index.ts');
    write('src/leaf/a.ts', "import { x } from '../core/util';");
    write('src/core/util.ts', 'export const x = 1;');

    expect(findViolations(repoRoot, configWithLeaf([]))).toEqual([]);
  });

  it('flags baseUrl-style src/... imports out of a leaf layer', () => {
    write('src/index.ts');
    write('src/core/util.ts', 'export const x = 1;');
    write('src/leaf/a.ts', "import { x } from 'src/core/util';");

    const violations = findViolations(repoRoot, configWithLeaf());
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('leaf');
    expect(violations[0].specifier).toBe('src/core/util');
  });

  it('skips the public facade as an importer (the rule applies to imports OF it, not from it)', () => {
    write('src/index.ts', "import { x } from './core/util';");
    write('src/core/util.ts', 'export const x = 1;');

    expect(findViolations(repoRoot, configWithLeaf())).toEqual([]);
  });
});
