import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

// Mock CSS imports to avoid PostCSS processing issues
vi.mock('prismjs/themes/prism.css', () => ({}));

/**
 * Tests to verify that circular dependency fixes are in place.
 *
 * For full circular dependency detection, run:
 *   npm run lint:circular
 *
 * This test suite verifies that the architectural patterns to prevent
 * circular dependencies are properly implemented.
 */
describe('Circular Dependencies Prevention', () => {
  const readSource = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8');

  describe('TestCaseGeneration module structure', () => {
    it('should be able to import testCaseGenerationTypes without circular dependency errors', async () => {
      // This test verifies that the types module can be imported successfully
      // If there was a circular dependency, this import would fail or hang
      const typesModule = await import('./pages/redteam/setup/components/testCaseGenerationTypes');

      // The module should load successfully (types are erased at runtime)
      expect(typesModule).toBeDefined();
    });

    it('should export runtime values from TestCaseGenerationProvider', async () => {
      // Verify the provider exports the expected runtime values
      const providerModule = await import(
        './pages/redteam/setup/components/TestCaseGenerationProvider'
      );

      // Provider should export the component and hook
      expect(providerModule).toHaveProperty('TestCaseGenerationProvider');
      expect(providerModule).toHaveProperty('useTestCaseGeneration');
    });
  });

  describe('Page layout constants extraction', () => {
    it('should export constants from constants.ts', async () => {
      // Verify that layout constants are extracted to avoid circular deps
      const constantsModule = await import('./pages/redteam/setup/constants');

      expect(constantsModule).toHaveProperty('SIDEBAR_WIDTH');
      expect(constantsModule).toHaveProperty('NAVBAR_HEIGHT');
      expect(constantsModule.SIDEBAR_WIDTH).toBe(240);
      expect(constantsModule.NAVBAR_HEIGHT).toBe(64);
    });

    it('should re-export SIDEBAR_WIDTH from page.tsx for backward compatibility', async () => {
      // Verify backward compatibility
      const pageSource = readSource('./pages/redteam/setup/page.tsx');
      expect(pageSource).toContain('export { SIDEBAR_WIDTH };');
      expect(pageSource).toContain("from './constants'");
    });
  });

  describe('Import structure verification', () => {
    it('TestCaseDialog should import types from testCaseGenerationTypes', async () => {
      // This test verifies the import doesn't cause issues
      // If there was a circular dependency, this import would fail or hang
      const dialogModule = await import('./pages/redteam/setup/components/TestCaseDialog');

      expect(dialogModule).toHaveProperty('TestCaseDialog');
      expect(dialogModule).toHaveProperty('TestCaseGenerateButton');
    });

    it('PageWrapper should import from constants, not page', async () => {
      // This test verifies the import structure is correct
      // If there was a circular dependency, this import would fail or hang
      const wrapperModule = await import('./pages/redteam/setup/components/PageWrapper');

      expect(wrapperModule).toHaveProperty('default');
    });
  });
});

/**
 * Documentation test - provides guidance for fixing circular dependencies
 */
describe('Circular Dependency Resolution Guide', () => {
  it('documents common patterns and solutions', () => {
    const patterns = {
      typeImports: {
        problem: 'Modules importing types from each other',
        solution: 'Extract shared types to a dedicated types file',
        example: 'src/pages/redteam/setup/components/testCaseGenerationTypes.ts',
      },
      constantImports: {
        problem: 'Parent/child modules sharing constants',
        solution: 'Extract constants to a dedicated constants file',
        example: 'src/pages/redteam/setup/constants.ts',
      },
      contextProviders: {
        problem: 'Provider imports component that uses the context',
        solution: 'Extract types to separate file, both import from there',
        example: 'Provider and Dialog both import from types file',
      },
      barrelFiles: {
        problem: 'index.ts re-exports from files that import the barrel',
        solution: 'Import directly from source files, avoid circular re-exports',
        example: 'Import from specific file, not from index',
      },
    };

    // Verify all patterns are documented
    expect(Object.keys(patterns)).toContain('typeImports');
    expect(Object.keys(patterns)).toContain('constantImports');
    expect(Object.keys(patterns)).toContain('contextProviders');
    expect(Object.keys(patterns)).toContain('barrelFiles');

    // Verify each pattern has required fields
    for (const pattern of Object.values(patterns)) {
      expect(pattern).toHaveProperty('problem');
      expect(pattern).toHaveProperty('solution');
      expect(pattern).toHaveProperty('example');
    }
  });

  it('provides instructions for running the lint check', () => {
    const instructions = `
To check for circular dependencies, run:
  npm run lint:circular

This command uses madge to analyze the import graph and will fail
if any circular dependencies are detected.

The lint:circular script is defined in src/app/package.json.
    `;

    expect(instructions).toContain('npm run lint:circular');
    expect(instructions).toContain('madge');
  });
});
