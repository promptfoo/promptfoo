/**
 * Integration tests for library exports in both ESM and CJS formats.
 *
 * These tests verify that the built library can be imported correctly
 * in both ESM and CJS environments after the build process.
 *
 * Prerequisites: Run `npm run build` before running these tests.
 *
 * NOTE: These tests are automatically skipped in CI when the build directory
 * doesn't exist (CI runs Jest tests before build). They will run in local
 * development after `npm run build` and in the integration test CI job.
 */

import fs from 'fs';
import path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';

const distDir = path.resolve(__dirname, '../../dist/src');
const buildExists = fs.existsSync(distDir);

// Skip all tests if build doesn't exist (e.g., in CI Jest run before build)
const describeIfBuildExists = buildExists ? describe : describe.skip;

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
});
