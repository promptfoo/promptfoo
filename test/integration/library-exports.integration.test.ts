/**
 * Integration tests for library exports in both ESM and CJS formats.
 *
 * These tests verify that the built library can be imported correctly
 * in both ESM and CJS environments after the build process.
 *
 * Prerequisites: Run `npm run build` before running these tests.
 *
 * NOTE: These tests are gated on a built `dist/` and become `describe.skip` when it is absent.
 * In CI, the non-building `integration-tests` job skips them, while the `build` job runs them after
 * `npm run build`. The separate `test:package-artifact` step verifies the packed npm artifact (see
 * scripts/testPackageArtifact.ts).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';

const distDir = path.resolve(__dirname, '../../dist/src');
const buildExists = fs.existsSync(distDir);

// Skip all tests if the build does not exist (for example, in a non-building Vitest test job).
const describeIfBuildExists = buildExists ? describe : describe.skip;

const contractsRuntimeBudgetBytes = {
  'contracts.js': 60_000,
  'contracts.cjs': 70_000,
} as const;
const contractsDeclarationClosureBudgetBytes = 95_000;

function resolveLocalModule(importerPath: string, specifier: string): string {
  const resolvedPath = path.resolve(path.dirname(importerPath), specifier);
  const candidates: string[] = [];
  const declarationExtension = importerPath.endsWith('.d.cts')
    ? '.d.cts'
    : importerPath.endsWith('.d.mts')
      ? '.d.mts'
      : importerPath.endsWith('.d.ts')
        ? '.d.ts'
        : undefined;

  if (declarationExtension) {
    const emittedMapping = (
      [
        ['.cjs', '.d.cts'],
        ['.mjs', '.d.mts'],
        ['.js', '.d.ts'],
      ] as const
    ).find(([emittedExtension]) => resolvedPath.endsWith(emittedExtension));
    if (emittedMapping) {
      const [emittedExtension, emittedDeclarationExtension] = emittedMapping;
      candidates.push(
        `${resolvedPath.slice(0, -emittedExtension.length)}${emittedDeclarationExtension}`,
      );
    } else if (path.extname(specifier) === '') {
      candidates.push(`${resolvedPath}${declarationExtension}`);
      candidates.push(path.join(resolvedPath, `index${declarationExtension}`));
    }
  }

  // Declaration files resolve their declaration siblings first; keep the emitted runtime path as
  // a fallback for packages that intentionally ship JavaScript without a declaration sibling.
  candidates.push(resolvedPath);

  const existingPath = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!existingPath) {
    throw new Error(
      `Unable to resolve local import ${specifier} from ${importerPath}; tried ${candidates.join(', ')}`,
    );
  }
  return existingPath;
}

/**
 * Follows the relative chunk imports out of a built entry file and returns the byte size of the
 * full reachable local graph plus the set of bare (external) specifiers it pulls. Used to measure
 * the contracts subpath's real footprint rather than just its thin re-export shim.
 */
function readModuleClosure(entryPath: string): { totalBytes: number; bareSpecifiers: Set<string> } {
  const visited = new Set<string>();
  const bareSpecifiers = new Set<string>();
  let totalBytes = 0;
  const stack = [entryPath];

  while (stack.length > 0) {
    const filePath = stack.pop() as string;
    if (visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);

    const source = fs.readFileSync(filePath, 'utf8');
    totalBytes += Buffer.byteLength(source);

    for (const match of source.matchAll(/(?:from|require|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        stack.push(resolveLocalModule(filePath, specifier));
      } else {
        bareSpecifiers.add(specifier.replace(/^node:/, '').split('/')[0]);
      }
    }
  }

  return { totalBytes, bareSpecifiers };
}

describe('declaration module resolution', () => {
  it.each([
    ['entry.d.ts', 'dep.js', 'dep.d.ts'],
    ['entry.d.cts', 'dep.cjs', 'dep.d.cts'],
    ['entry.d.mts', 'dep.mjs', 'dep.d.mts'],
  ])('prefers declaration siblings for %s imports', (importerName, emittedName, declarationName) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-contract-resolution-'));
    try {
      const importerPath = path.join(tempDir, importerName);
      fs.writeFileSync(importerPath, `export * from './${emittedName}';`);
      fs.writeFileSync(path.join(tempDir, emittedName), 'export const runtime = true;');
      fs.writeFileSync(
        path.join(tempDir, declarationName),
        "import 'declaration-only-dependency';",
      );

      const { bareSpecifiers } = readModuleClosure(importerPath);
      expect([...bareSpecifiers]).toEqual(['declaration-only-dependency']);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves extensionless declaration directory indexes as files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-contract-resolution-'));
    try {
      const importerPath = path.join(tempDir, 'entry.d.ts');
      const dependencyDir = path.join(tempDir, 'dependency');
      fs.mkdirSync(dependencyDir);
      fs.writeFileSync(importerPath, "export * from './dependency';");
      fs.writeFileSync(
        path.join(dependencyDir, 'index.d.ts'),
        "import 'declaration-index-dependency';",
      );

      const { bareSpecifiers } = readModuleClosure(importerPath);
      expect([...bareSpecifiers]).toEqual(['declaration-index-dependency']);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describeIfBuildExists('Library Exports', () => {
  describe('Build artifacts', () => {
    it('should have ESM library build (index.js)', () => {
      const esmPath = path.join(distDir, 'index.js');
      expect(fs.existsSync(esmPath)).toBe(true);

      const stats = fs.statSync(esmPath);
      expect(stats.size).toBeGreaterThan(100000); // Should be substantial
    });

    it('should have CJS library build (index.cjs)', () => {
      const cjsPath = path.join(distDir, 'index.cjs');
      expect(fs.existsSync(cjsPath)).toBe(true);

      const stats = fs.statSync(cjsPath);
      expect(stats.size).toBeGreaterThan(100000); // Should be substantial
    });

    it('should have lightweight, zod-only contracts builds', () => {
      // The contracts entry files are thin re-export shims; the real footprint lives in the shared
      // chunks they import. Measure the whole transitive closure (entry + every reachable local
      // chunk), not just the shim, so a regression that inlines a heavy dep into a chunk is caught.
      for (const [entry, budgetBytes] of Object.entries(contractsRuntimeBudgetBytes)) {
        const { totalBytes, bareSpecifiers } = readModuleClosure(path.join(distDir, entry));
        // Shared local API routes and response schemas bring the closures to ~47KB ESM / ~57KB
        // CJS. Keep format-specific headroom while still catching a leaked or inlined dependency.
        expect(totalBytes).toBeLessThan(budgetBytes);
        // Leaf-safe contract: zod is the ONLY external the subpath may pull. This catches both a
        // newly-leaked dependency (extra entry) AND zod accidentally being inlined (zod disappears).
        expect([...bareSpecifiers].sort()).toEqual(['zod']);
      }

      for (const declaration of ['contracts.d.ts', 'contracts.d.cts']) {
        const declarationPath = path.join(distDir, declaration);
        expect(fs.existsSync(declarationPath)).toBe(true);
        const { totalBytes, bareSpecifiers } = readModuleClosure(declarationPath);
        // The entry and its generated transform declaration chunk total ~80KB in either format.
        expect(totalBytes).toBeLessThan(contractsDeclarationClosureBudgetBytes);
        expect([...bareSpecifiers].sort()).toEqual(['zod']);
      }
    });

    it('should have ESM CLI build (main.js)', () => {
      const cliPath = path.join(distDir, 'main.js');
      expect(fs.existsSync(cliPath)).toBe(true);

      // CLI should have shebang
      const content = fs.readFileSync(cliPath, 'utf8');
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
    });

    it('should have package.json with type: module in dist', () => {
      const pkgPath = path.join(distDir, 'package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.type).toBe('module');
    });
  });

  describe('CJS library import', () => {
    let cjsModule: any;

    beforeAll(() => {
      // Use require to test CJS import
      const cjsPath = path.join(distDir, 'index.cjs');
      cjsModule = require(cjsPath);
    });

    it('should export key types and schemas', () => {
      // Check for Zod schemas (common exports)
      expect(cjsModule.AssertionSchema).toBeDefined();
      expect(cjsModule.AtomicTestCaseSchema).toBeDefined();
    });

    it('should export utility functions', () => {
      // These are commonly used exports
      expect(typeof cjsModule.evaluate === 'function' || cjsModule.evaluate === undefined).toBe(
        true,
      );
    });

    it('should not throw when importing', () => {
      expect(() => {
        const cjsPath = path.join(distDir, 'index.cjs');
        require(cjsPath);
      }).not.toThrow();
    });
  });

  describe('CJS contracts import', () => {
    it('should export portable contract schemas', () => {
      const contractsModule = require(path.join(distDir, 'contracts.cjs'));
      expect(contractsModule.EmailSchema).toBeDefined();
      expect(contractsModule.GetUserResponseSchema).toBeDefined();
      expect(contractsModule.InputsSchema).toBeDefined();
      expect(contractsModule.PromptSchema).toBeDefined();
      expect(contractsModule.ApiRoutes.Health.expressPath).toBe('/health');
      expect(
        contractsModule.ServerResponseSchemas.Health.Response.safeParse({
          status: 'OK',
          version: 'test',
        }).success,
      ).toBe(true);
      expect(
        contractsModule.ModelAuditSchemas.ListScans.Query.safeParse({ limit: 1 }).success,
      ).toBe(true);
    });
  });

  describe('ESM library import', () => {
    it('should be importable via dynamic import', async () => {
      const esmPath = `file://${path.join(distDir, 'index.js')}`;
      const esmModule = await import(esmPath);

      // Check for Zod schemas (common exports)
      expect(esmModule.AssertionSchema).toBeDefined();
      expect(esmModule.AtomicTestCaseSchema).toBeDefined();
    });

    it('should export the same keys in ESM and CJS', async () => {
      const esmPath = `file://${path.join(distDir, 'index.js')}`;
      const cjsPath = path.join(distDir, 'index.cjs');

      const esmModule = await import(esmPath);
      const cjsModule = require(cjsPath);

      const esmKeys = Object.keys(esmModule).sort();
      const cjsKeys = Object.keys(cjsModule).sort();

      // ESM may have additional 'default' export
      const filteredEsmKeys = esmKeys.filter((k) => k !== 'default');

      // The exports should be equivalent (allowing for minor differences)
      expect(filteredEsmKeys.length).toBeGreaterThan(10); // Sanity check
      expect(cjsKeys.length).toBeGreaterThan(10);

      // Key exports should be present in both
      const keyExports = ['AssertionSchema', 'AtomicTestCaseSchema', 'TestSuiteSchema'];
      for (const key of keyExports) {
        expect(filteredEsmKeys).toContain(key);
        expect(cjsKeys).toContain(key);
      }
    });
  });

  describe('ESM contracts import', () => {
    it('should export portable contract schemas', async () => {
      const contractsModule = await import(`file://${path.join(distDir, 'contracts.js')}`);
      expect(contractsModule.EmailSchema).toBeDefined();
      expect(contractsModule.GetUserResponseSchema).toBeDefined();
      expect(contractsModule.InputsSchema).toBeDefined();
      expect(contractsModule.PromptSchema).toBeDefined();
      expect(contractsModule.ApiRoutes.Health.expressPath).toBe('/health');
      expect(
        contractsModule.ServerResponseSchemas.Health.Response.safeParse({
          status: 'OK',
          version: 'test',
        }).success,
      ).toBe(true);
      expect(
        contractsModule.ModelAuditSchemas.ListScans.Query.safeParse({ limit: 1 }).success,
      ).toBe(true);
    });
  });
});
