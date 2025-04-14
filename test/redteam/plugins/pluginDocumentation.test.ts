import fs from 'fs';
import path from 'path';

const PLUGINS_DIR = path.join(__dirname, '../../../src/redteam/plugins');
const DOCS_DIR = path.join(__dirname, '../../../site/docs/red-team/plugins');

function getFiles(dir: string, extension: string, excludes: string[] = []): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(extension) && !excludes.includes(file))
    .map((file) => file.replace(extension, ''));
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function toCamelCase(str: string): string {
  return str.replace(/-./g, (x) => x[1].toUpperCase());
}

describe('Plugin Documentation', () => {
  const pluginFiles = getFiles(PLUGINS_DIR, '.ts', ['index.ts', 'base.ts']);
  const docFiles = getFiles(DOCS_DIR, '.md', ['_category_.json']);

  it('should have matching plugin and documentation files', () => {
    const pluginSet = new Set(pluginFiles.map(toKebabCase));
    const docSet = new Set(docFiles);

    // Check that all plugins have corresponding docs
    pluginSet.forEach((plugin) => {
      expect(docSet.has(plugin)).toBe(true);
    });
  });

  it('should have correct naming conventions for plugins and docs', () => {
    pluginFiles.forEach((plugin) => {
      const kebabPlugin = toKebabCase(plugin);
      expect(docFiles).toContain(kebabPlugin);
      expect(pluginFiles).toContain(toCamelCase(kebabPlugin));
    });
  });
});
