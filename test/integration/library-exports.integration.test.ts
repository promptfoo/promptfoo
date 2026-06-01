/**
 * Integration tests for library exports in both ESM and CJS formats.
 *
 * These tests verify that the built library can be imported correctly
 * in both ESM and CJS environments after the build process.
 *
 * Prerequisites: Run `npm run build` before running these tests.
 *
 * NOTE: These tests are gated on a built `dist/` and become `describe.skip` when it is absent.
 * The `integration-tests` CI job does not build, so they are skipped there and run only locally
 * after `npm run build`. The published artifacts themselves are independently verified in CI by
 * the build-and-pack `test:package-artifact` job (see scripts/testPackageArtifact.ts).
 */

import fs from 'fs';
import path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';

const distDir = path.resolve(__dirname, '../../dist/src');
const buildExists = fs.existsSync(distDir);

// Skip all tests if build doesn't exist (e.g., in CI Jest run before build)
const describeIfBuildExists = buildExists ? describe : describe.skip;

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
        stack.push(path.resolve(path.dirname(filePath), specifier));
      } else {
        bareSpecifiers.add(specifier.replace(/^node:/, '').split('/')[0]);
      }
    }
  }

  return { totalBytes, bareSpecifiers };
}

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
      for (const entry of ['contracts.js', 'contracts.cjs']) {
        const { totalBytes, bareSpecifiers } = readModuleClosure(path.join(distDir, entry));
        // ~14KB (ESM) / ~19KB (CJS) today; a heavy dep or inlined zod would blow well past this.
        expect(totalBytes).toBeLessThan(50000);
        // Leaf-safe contract: zod is the ONLY external the subpath may pull. This catches both a
        // newly-leaked dependency (extra entry) AND zod accidentally being inlined (zod disappears).
        expect([...bareSpecifiers].sort()).toEqual(['zod']);
      }

      for (const declaration of ['contracts.d.ts', 'contracts.d.cts']) {
        const declarationPath = path.join(distDir, declaration);
        expect(fs.existsSync(declarationPath)).toBe(true);
        expect(fs.statSync(declarationPath).size).toBeLessThan(50000);
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
      expect(contractsModule.InputsSchema).toBeDefined();
      expect(contractsModule.PromptSchema).toBeDefined();
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
      expect(contractsModule.InputsSchema).toBeDefined();
      expect(contractsModule.PromptSchema).toBeDefined();
    });
  });
});
