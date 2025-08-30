/**
 * Tests for dual-package publishing (CJS/ESM compatibility)
 * Verifies that the built packages work correctly in both CommonJS and ESM contexts
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

describe('Dual Package Publishing', () => {
  const distPath = path.resolve(__dirname, '../dist');
  const cjsIndexPath = path.resolve(distPath, 'cjs/src/index.cjs');
  const esmIndexPath = path.resolve(distPath, 'esm/src/index.js');
  const typesIndexPath = path.resolve(distPath, 'types/src/index.d.ts');

  beforeAll(() => {
    // Ensure build artifacts exist
    if (!existsSync(cjsIndexPath)) {
      throw new Error('CJS build not found. Run "npm run build" first.');
    }
    if (!existsSync(esmIndexPath)) {
      throw new Error('ESM build not found. Run "npm run build" first.');
    }
    if (!existsSync(typesIndexPath)) {
      throw new Error('Types build not found. Run "npm run build" first.');
    }
  });

  describe('CommonJS Compatibility', () => {
    it('should import main exports using require()', () => {
      const testScript = `
        const promptfoo = require('${cjsIndexPath}');
        
        // Test main exports exist
        console.log(JSON.stringify({
          hasEvaluate: typeof promptfoo.evaluate === 'function',
          hasAssertions: typeof promptfoo.assertions === 'object',
          hasCache: typeof promptfoo.cache === 'object',
          hasGuardrails: typeof promptfoo.guardrails === 'object',
          hasRedteam: typeof promptfoo.redteam === 'object',
          hasLoadApiProvider: typeof promptfoo.loadApiProvider === 'function'
        }));
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.hasEvaluate).toBe(true);
      expect(parsed.hasAssertions).toBe(true);
      expect(parsed.hasCache).toBe(true);
      expect(parsed.hasGuardrails).toBe(true);
      expect(parsed.hasRedteam).toBe(true);
      expect(parsed.hasLoadApiProvider).toBe(true);
    });

    it('should import named exports using require()', () => {
      const testScript = `
        const { evaluate, assertions, cache } = require('${cjsIndexPath}');
        
        console.log(JSON.stringify({
          evaluateType: typeof evaluate,
          assertionsType: typeof assertions,
          cacheType: typeof cache
        }));
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.evaluateType).toBe('function');
      expect(parsed.assertionsType).toBe('object');
      expect(parsed.cacheType).toBe('object');
    });

    it('should work with default export', () => {
      const testScript = `
        const promptfoo = require('${cjsIndexPath}').default;
        
        console.log(JSON.stringify({
          hasEvaluate: typeof promptfoo.evaluate === 'function',
          hasAssertions: typeof promptfoo.assertions === 'object'
        }));
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.hasEvaluate).toBe(true);
      expect(parsed.hasAssertions).toBe(true);
    });
  });

  describe('ESM Compatibility', () => {
    it('should import main exports using ES modules', async () => {
      const testScript = `
        import promptfoo from '${esmIndexPath}';
        
        console.log(JSON.stringify({
          hasEvaluate: typeof promptfoo.evaluate === 'function',
          hasAssertions: typeof promptfoo.assertions === 'object',
          hasCache: typeof promptfoo.cache === 'object',
          hasGuardrails: typeof promptfoo.guardrails === 'object',
          hasRedteam: typeof promptfoo.redteam === 'object',
          hasLoadApiProvider: typeof promptfoo.loadApiProvider === 'function'
        }));
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.hasEvaluate).toBe(true);
      expect(parsed.hasAssertions).toBe(true);
      expect(parsed.hasCache).toBe(true);
      expect(parsed.hasGuardrails).toBe(true);
      expect(parsed.hasRedteam).toBe(true);
      expect(parsed.hasLoadApiProvider).toBe(true);
    });

    it('should import named exports using ES modules', async () => {
      const testScript = `
        import { evaluate, assertions, cache } from '${esmIndexPath}';
        
        console.log(JSON.stringify({
          evaluateType: typeof evaluate,
          assertionsType: typeof assertions,
          cacheType: typeof cache
        }));
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.evaluateType).toBe('function');
      expect(parsed.assertionsType).toBe('object');
      expect(parsed.cacheType).toBe('object');
    });

    it('should handle JSON imports with correct attributes', async () => {
      // Test that JSON imports work in ESM build by checking file content directly
      const fs = require('fs');
      const constantsFile = fs.readFileSync(esmIndexPath.replace('index.js', 'constants.js'), 'utf8');
      const hasJsonAttribute = constantsFile.includes("with { type: 'json' }");
      
      expect(hasJsonAttribute).toBe(true);
    });

    it('should validate ESM JSON import syntax is Node 20+ compatible', async () => {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.match(/v(\d+)/)?.[1] || '0', 10);
      
      // This test ensures we're using the correct JSON import syntax for Node 20+
      if (majorVersion >= 20) {
        const testScript = `
          // Test that the new 'with' syntax works (Node 20+)
          try {
            const pkg = await import('${esmIndexPath.replace('/src/index.js', '/package.json')}', { with: { type: 'json' } });
            console.log(JSON.stringify({ 
              success: true, 
              hasVersion: typeof pkg.default.version === 'string',
              syntax: 'with',
              nodeVersion: process.version
            }));
          } catch (error) {
            console.log(JSON.stringify({ success: false, error: error.message, nodeVersion: process.version }));
          }
        `;

        const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
        const parsed = JSON.parse(result.trim());

        expect(parsed.success).toBe(true);
        expect(parsed.hasVersion).toBe(true);
        expect(parsed.syntax).toBe('with');
      } else {
        console.log(`Skipping Node 20+ JSON import syntax test on Node ${nodeVersion}`);
      }
    });

    it('should support dynamic JSON imports with assertions in ESM on Node 20+', async () => {
      // Skip this test on unsupported Node versions
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.match(/v(\d+)/)?.[1] || '0', 10);
      if (majorVersion < 20) {
        console.log(`Skipping JSON import assertion test on Node ${nodeVersion} (requires Node 20+)`);
        return;
      }

      const testScript = `
        // Test dynamic JSON import with assertion (Node 20+ feature)
        const jsonModule = await import('${esmIndexPath.replace('index.js', 'redteam/strategies/promptInjections/data.json')}', { with: { type: 'json' } });
        console.log(JSON.stringify({ 
          hasDefault: typeof jsonModule.default !== 'undefined',
          isArray: Array.isArray(jsonModule.default),
          length: jsonModule.default?.length || 0,
          nodeVersion: process.version
        }));
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.hasDefault).toBe(true);
      expect(parsed.isArray).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed.nodeVersion).toMatch(/^v(2[0-9]|[3-9][0-9])\./); // Node 20+
    });
  });

  describe('Package.json exports', () => {
    it('should respect package.json exports field', () => {
      const packageJson = require('../package.json');

      expect(packageJson.exports).toMatchObject({
        '.': {
          types: './dist/types/src/index.d.ts',
          import: './dist/esm/src/index.js',
          require: './dist/cjs/src/index.cjs',
        },
        './package.json': './package.json',
      });
    });

    it('should have correct main field for CommonJS', () => {
      const packageJson = require('../package.json');
      expect(packageJson.main).toBe('dist/cjs/src/index.cjs');
    });

    it('should have correct types field', () => {
      const packageJson = require('../package.json');
      expect(packageJson.types).toBe('dist/types/src/index.d.ts');
    });

    it('should have type: "module" for ESM', () => {
      const packageJson = require('../package.json');
      expect(packageJson.type).toBe('module');
    });

    it('should have subpath exports for major modules', () => {
      const packageJson = require('../package.json');
      const expectedExports = [
        './assertions',
        './providers', 
        './redteam',
        './types',
        './util',
        './cache',
        './evaluator',
        './logger'
      ];

      for (const exportPath of expectedExports) {
        expect(packageJson.exports[exportPath]).toBeDefined();
        expect(packageJson.exports[exportPath]).toMatchObject({
          types: expect.stringMatching(/\.d\.ts$/),
          import: expect.stringMatching(/\.js$/),
          require: expect.stringMatching(/\.cjs$/)
        });
      }
    });

    it('should have good package hygiene', () => {
      const packageJson = require('../package.json');
      
      // Should have sideEffects: false for tree shaking
      expect(packageJson.sideEffects).toBe(false);
      
      // Should have comprehensive files field
      expect(packageJson.files).toBeInstanceOf(Array);
      expect(packageJson.files.length).toBeGreaterThan(5);
      
      // Should include built files
      expect(packageJson.files).toContain('dist/cjs/**/*.cjs');
      expect(packageJson.files).toContain('dist/esm/**/*.js');
      expect(packageJson.files).toContain('dist/types/**/*.d.ts');
      
      // Should exclude test files
      expect(packageJson.files.some((f: string) => f.includes('!dist/test/**'))).toBe(true);
      expect(packageJson.files.some((f: string) => f.includes('!dist/**/*.test.*'))).toBe(true);
    });

    it('should enforce Node 20+ requirement', () => {
      const packageJson = require('../package.json');
      const currentNodeVersion = process.version;
      const majorVersion = parseInt(currentNodeVersion.match(/v(\d+)/)?.[1] || '0', 10);
      
      // Package should require Node 20+
      expect(packageJson.engines.node).toBe('>=20.0.0');
      
      // Current test environment should meet this requirement
      expect(majorVersion).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Directory imports', () => {
    it('should handle directory imports in ESM with explicit index.js', () => {
      // Check that directory imports are properly resolved
      const fs = require('fs');
      const indexFile = fs.readFileSync(esmIndexPath, 'utf8');
      const hasExplicitIndexImports = indexFile.includes('./assertions/index.js');
      
      expect(hasExplicitIndexImports).toBe(true);
    });

    it('should handle directory imports in CJS with automatic resolution', () => {
      // Check that CJS can still use directory imports without extensions
      const fs = require('fs');
      const indexFile = fs.readFileSync(cjsIndexPath, 'utf8');
      const hasDirectoryImports = indexFile.includes('./assertions');
      
      expect(hasDirectoryImports).toBe(true);
    });
  });

  describe('File extensions', () => {
    it('should have .js extensions for all relative imports in ESM', () => {
      // Use our existing validation script instead of inline code
      const result = execSync('node scripts/fix-esm-imports.cjs validate', { encoding: 'utf-8' });
      expect(result).toContain('✅ ESM validation passed!');
    });

    it('should have .cjs extensions for CJS files', () => {
      expect(cjsIndexPath.endsWith('.cjs')).toBe(true);
      expect(existsSync(cjsIndexPath)).toBe(true);
    });
  });

  describe('Subpath exports', () => {
    it('should allow importing major modules via subpaths in CommonJS', () => {
      const testScript = `
        // Test importing via subpath exports
        const assertions = require('${distPath.replace(/\\/g, '/')}/cjs/src/assertions/index.cjs');
        const types = require('${distPath.replace(/\\/g, '/')}/cjs/src/types/index.cjs');
        
        console.log(JSON.stringify({
          hasAssertions: typeof assertions === 'object',
          hasTypes: typeof types === 'object'
        }));
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.hasAssertions).toBe(true);
      expect(parsed.hasTypes).toBe(true);
    });

    it('should allow importing major modules via subpaths in ESM', () => {
      const testScript = `
        import('${distPath.replace(/\\/g, '/')}/esm/src/assertions/index.js').then(assertions => {
          return import('${distPath.replace(/\\/g, '/')}/esm/src/types/index.js').then(types => {
            console.log(JSON.stringify({
              hasAssertions: typeof assertions === 'object',
              hasTypes: typeof types === 'object'
            }));
          });
        });
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.hasAssertions).toBe(true);
      expect(parsed.hasTypes).toBe(true);
    });
  });

  describe('Cross-compatibility', () => {
    it('should export the same interface from both CJS and ESM', () => {
      const testScript = `
        const cjsModule = require('${cjsIndexPath}');
        
        // Use dynamic import for ESM
        import('${esmIndexPath}').then(esmModule => {
          const cjsKeys = Object.keys(cjsModule).sort();
          const esmKeys = Object.keys(esmModule).sort();
          
          console.log(JSON.stringify({
            cjsKeys,
            esmKeys,
            keysMatch: JSON.stringify(cjsKeys) === JSON.stringify(esmKeys)
          }));
        });
      `;

      const result = execSync(`node -e "${testScript}"`, { encoding: 'utf-8' });
      const parsed = JSON.parse(result.trim());

      expect(parsed.keysMatch).toBe(true);
      expect(parsed.cjsKeys).toEqual(parsed.esmKeys);
    });
  });
});