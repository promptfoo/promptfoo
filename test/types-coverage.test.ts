/**
 * Test that typesVersions covers all exported subpaths
 */
import { existsSync } from 'fs';
import path from 'path';

describe('TypeScript Types Coverage', () => {
  const packageJson = require('../package.json');
  const { exports, typesVersions } = packageJson;

  it('should have typesVersions entries for all exports', () => {
    const exportPaths = Object.keys(exports).filter(
      (key) => key !== '.' && key !== './package.json',
    );
    const typesVersionsPaths = Object.keys(typesVersions['*']);

    // Check that each export path has a corresponding typesVersions entry
    for (const exportPath of exportPaths) {
      const subpath = exportPath.startsWith('./') ? exportPath.slice(2) : exportPath;
      expect(typesVersionsPaths).toContain(subpath);
    }
  });

  it('should have valid type files for all exports', () => {
    const exportPaths = Object.keys(exports).filter((key) => key !== './package.json');

    for (const exportPath of exportPaths) {
      const exportConfig = exports[exportPath];
      if (typeof exportConfig === 'object' && exportConfig.types) {
        const typePath = path.resolve(__dirname, '..', exportConfig.types);
        expect(existsSync(typePath)).toBe(true);
      }
    }
  });

  it('should have valid typesVersions paths that exist', () => {
    const typesVersionsPaths = typesVersions['*'];

    for (const [_key, paths] of Object.entries(typesVersionsPaths)) {
      const pathArray = Array.isArray(paths) ? paths : [paths];

      for (const typePath of pathArray) {
        // Only check non-wildcard paths
        if (!typePath.includes('*')) {
          const fullPath = path.resolve(__dirname, '..', typePath);
          expect(existsSync(fullPath)).toBe(true);
        }
      }
    }
  });

  it('should cover all major subpath exports', () => {
    const requiredSubpaths = [
      'assertions',
      'providers',
      'redteam',
      'types',
      'util',
      'cache',
      'evaluator',
      'logger',
    ];

    const exportPaths = Object.keys(exports)
      .filter((key) => key !== '.' && key !== './package.json')
      .map((key) => (key.startsWith('./') ? key.slice(2) : key));

    for (const requiredPath of requiredSubpaths) {
      expect(exportPaths).toContain(requiredPath);
    }
  });

  it('should have consistent type paths between exports and typesVersions', () => {
    const exportPaths = Object.keys(exports).filter(
      (key) => key !== '.' && key !== './package.json',
    );

    for (const exportPath of exportPaths) {
      const subpath = exportPath.startsWith('./') ? exportPath.slice(2) : exportPath;
      const exportConfig = exports[exportPath];

      if (typeof exportConfig === 'object' && exportConfig.types) {
        const typesVersionsEntry = typesVersions['*'][subpath];
        if (typesVersionsEntry) {
          const expectedPath = Array.isArray(typesVersionsEntry)
            ? typesVersionsEntry[0]
            : typesVersionsEntry;
          expect(exportConfig.types).toBe(expectedPath);
        }
      }
    }
  });
});
