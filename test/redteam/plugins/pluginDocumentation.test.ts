import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

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

async function loadPluginsFromConstants(): Promise<Set<string>> {
  const constantsPath = path.join(__dirname, '../../../src/redteam/constants/plugins.ts');

  // Import the module to get the actual values
  const pluginsModule = await import(constantsPath);

  const allPlugins = new Set<string>();

  // Collect all plugins from different arrays
  const pluginArrays = [
    'FOUNDATION_PLUGINS',
    'AGENTIC_PLUGINS',
    'BASE_PLUGINS',
    'ADDITIONAL_PLUGINS',
    'CONFIG_REQUIRED_PLUGINS',
    'PII_PLUGINS',
    'BIAS_PLUGINS',
  ];

  // Include remote-only plugin IDs (includes coding-agent plugins)
  if (pluginsModule.REMOTE_ONLY_PLUGIN_IDS) {
    (pluginsModule.REMOTE_ONLY_PLUGIN_IDS as string[]).forEach((p: string) => allPlugins.add(p));
  }

  // Include collection IDs so docs entries for collections (e.g., coding-agent:core) aren't flagged as orphaned
  if (pluginsModule.COLLECTIONS) {
    (pluginsModule.COLLECTIONS as string[]).forEach((c: string) => allPlugins.add(c));
  }

  for (const arrayName of pluginArrays) {
    const array = pluginsModule[arrayName];
    if (Array.isArray(array)) {
      array.forEach((plugin: string) => allPlugins.add(plugin));
    }
  }

  // Add harm plugins
  if (pluginsModule.HARM_PLUGINS) {
    Object.keys(pluginsModule.HARM_PLUGINS).forEach((plugin) => allPlugins.add(plugin));
  }

  return allPlugins;
}

async function loadPluginsFromDocs(): Promise<Set<string>> {
  const docsPath = path.join(__dirname, '../../../site/docs/_shared/data/plugins.ts');

  // Import the module to get the actual values
  const docsModule = await import(docsPath);

  const allPlugins = new Set<string>();

  // Extract pluginId from each plugin in the PLUGINS array
  if (docsModule.PLUGINS && Array.isArray(docsModule.PLUGINS)) {
    docsModule.PLUGINS.forEach((plugin: any) => {
      if (plugin.pluginId) {
        allPlugins.add(plugin.pluginId);
      }
    });
  } else {
    throw new Error('PLUGINS array not found in docs file');
  }

  return allPlugins;
}

describe('Plugin Documentation', () => {
  const pluginFiles = getFiles(PLUGINS_DIR, '.ts', [
    'index.ts',
    'base.ts',
    'dataExfil.ts', // Grader class, not a user-facing plugin
    'imageDatasetPluginBase.ts',
    'imageDatasetUtils.ts',
    'multiInputFormat.ts',
  ]);
  const docFiles = getFiles(DOCS_DIR, '.md', ['_category_.json']);

  describe('Plugin files and documentation files', () => {
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

  describe('Plugin data synchronization', () => {
    it('should have all plugins from constants in documentation data', async () => {
      const constantsPlugins = await loadPluginsFromConstants();
      const docsPlugins = await loadPluginsFromDocs();

      // Collections are shorthand aliases (e.g., 'default', 'foundation') that don't need
      // individual docs entries — they expand to plugin IDs that have their own entries.
      const pluginsModule = await import(
        path.join(__dirname, '../../../src/redteam/constants/plugins.ts')
      );
      const collections = new Set(pluginsModule.COLLECTIONS as string[]);

      // Find plugins missing from docs (excluding collection aliases)
      const missingFromDocs = [...constantsPlugins].filter(
        (plugin) => !docsPlugins.has(plugin) && !collections.has(plugin),
      );

      expect(
        missingFromDocs,
        `Plugins missing from documentation data. Add these plugins to site/docs/_shared/data/plugins.ts:\n${missingFromDocs.map((plugin) => `  - ${plugin}`).join('\n')}`,
      ).toEqual([]);
    });

    it('should not have orphaned plugins in documentation data', async () => {
      const constantsPlugins = await loadPluginsFromConstants();
      const docsPlugins = await loadPluginsFromDocs();

      // Find plugins missing from constants
      const missingFromConstants = [...docsPlugins].filter(
        (plugin) => !constantsPlugins.has(plugin),
      );

      expect(
        missingFromConstants,
        `Orphaned plugins in documentation data. Remove these from site/docs/_shared/data/plugins.ts or add them to src/redteam/constants/plugins.ts:\n${missingFromConstants.map((plugin) => `  - ${plugin}`).join('\n')}`,
      ).toEqual([]);
    });

    it('should have plugin constants and documentation data files', async () => {
      const constantsPath = path.join(__dirname, '../../../src/redteam/constants/plugins.ts');
      const docsPath = path.join(__dirname, '../../../site/docs/_shared/data/plugins.ts');

      expect(fs.existsSync(constantsPath)).toBe(true);
      expect(fs.existsSync(docsPath)).toBe(true);
    });
  });
});
