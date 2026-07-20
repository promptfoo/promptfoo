import fs from 'fs';
import path from 'path';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { RedteamConfigSchema } from '../../../src/validators/redteam';

const PLUGINS_DIR = path.join(__dirname, '../../../src/redteam/plugins');
const DOCS_DIR = path.join(__dirname, '../../../site/docs/red-team/plugins');
const STRATEGIES_DOCS_DIR = path.join(__dirname, '../../../site/docs/red-team/strategies');

const REDTEAM_CONFIG_KEYS = new Set([
  'injectVar',
  'purpose',
  'testGenerationInstructions',
  'provider',
  'numTests',
  'language',
  'frameworks',
  'entities',
  'contexts',
  'plugins',
  'strategies',
  'maxConcurrency',
  'maxCharsPerMessage',
  'delay',
  'excludeTargetOutputFromAgenticAttackGeneration',
  'tracing',
  'graderExamples',
]);

function getYamlFences(filePath: string): Array<{ line: number; yaml: string }> {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const fences: Array<{ line: number; yaml: string }> = [];
  let start = -1;
  let fence = '';

  for (let index = 0; index < lines.length; index++) {
    const openingFence = lines[index].match(/^(`{3,}|~{3,})(?:yaml|yml)(?:\s+.*)?$/i);
    if (start < 0 && openingFence) {
      start = index + 1;
      fence = openingFence[1];
      continue;
    }
    if (start >= 0 && lines[index].startsWith(fence)) {
      fences.push({ line: start + 1, yaml: lines.slice(start, index).join('\n') });
      start = -1;
      fence = '';
    }
  }

  return fences;
}

function getRedteamConfig(parsed: unknown): Record<string, unknown> | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }

  const config = parsed as Record<string, unknown>;
  if (config.redteam && typeof config.redteam === 'object' && !Array.isArray(config.redteam)) {
    return config.redteam as Record<string, unknown>;
  }

  return Object.keys(config).every((key) => REDTEAM_CONFIG_KEYS.has(key)) ? config : undefined;
}

function validateYamlFence(file: string, line: number, yaml: string): string | undefined {
  const location = `${path.relative(path.join(__dirname, '../../..'), file)}:${line}`;
  let parsed: unknown;

  try {
    parsed = loadYaml(yaml);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : error;
    return `${location}: ${message}`;
  }

  const redteam = getRedteamConfig(parsed);
  if (!redteam) {
    return undefined;
  }

  const unknownKeys = Object.keys(redteam).filter((key) => !REDTEAM_CONFIG_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return `${location}: unknown redteam keys: ${unknownKeys.join(', ')}`;
  }

  const result = RedteamConfigSchema.safeParse(redteam);
  if (result.success) {
    return undefined;
  }

  const issue = result.error.issues[0];
  return `${location}: ${issue.path.join('.') || 'redteam'}: ${issue.message}`;
}

function getDocumentationFiles(): string[] {
  return [DOCS_DIR, STRATEGIES_DOCS_DIR].flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(dir, file)),
  );
}

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

    it('should mark remote-generation plugins in the documentation data', async () => {
      const pluginsModule = await import(
        path.join(__dirname, '../../../src/redteam/constants/plugins.ts')
      );
      const docsModule = await import(
        path.join(__dirname, '../../../site/docs/_shared/data/plugins.ts')
      );
      const remotePlugins = new Set(
        pluginsModule.UI_DISABLED_WHEN_REMOTE_UNAVAILABLE as readonly string[],
      );
      const missingRemoteMarker = docsModule.PLUGINS.filter(
        (plugin: { pluginId: string; isRemote?: boolean }) =>
          remotePlugins.has(plugin.pluginId) && !plugin.isRemote,
      ).map((plugin: { pluginId: string }) => plugin.pluginId);

      expect(
        missingRemoteMarker,
        `Remote-generation plugins missing the documentation globe marker:\n${missingRemoteMarker.map((plugin: string) => `  - ${plugin}`).join('\n')}`,
      ).toEqual([]);
    });
  });

  describe('Strategy data synchronization', () => {
    it('should document current strategies and mark remote-generation strategies', async () => {
      const strategiesModule = await import(
        path.join(__dirname, '../../../src/redteam/constants/strategies.ts')
      );
      const docsModule = await import(
        path.join(__dirname, '../../../site/docs/_shared/data/strategies.ts')
      );
      const documented = new Set(
        docsModule.strategies.map((strategy: { strategy: string }) => strategy.strategy),
      );
      const allowedMissing = new Set([
        'default',
        'jailbreak',
        'multilingual',
        'prompt-injection',
        ...strategiesModule.STRATEGY_COLLECTIONS,
      ]);
      const missing = strategiesModule.ALL_STRATEGIES.filter(
        (strategy: string) => !allowedMissing.has(strategy) && !documented.has(strategy),
      );
      const missingRemoteMarker = docsModule.strategies
        .filter(
          (strategy: { strategy: string; isRemote?: boolean }) =>
            strategiesModule.STRATEGIES_REQUIRING_REMOTE_SET.has(strategy.strategy) &&
            !strategy.isRemote,
        )
        .map((strategy: { strategy: string }) => strategy.strategy);
      const recommendedDeprecated = docsModule.strategies
        .filter(
          (strategy: { strategy: string; recommended?: boolean }) =>
            ['jailbreak', 'multilingual', 'prompt-injection'].includes(strategy.strategy) &&
            strategy.recommended,
        )
        .map((strategy: { strategy: string }) => strategy.strategy);

      expect(missing, `Strategies missing from documentation data:\n${missing.join('\n')}`).toEqual(
        [],
      );
      expect(
        missingRemoteMarker,
        `Remote-generation strategies missing the documentation globe marker:\n${missingRemoteMarker.join('\n')}`,
      ).toEqual([]);
      expect(
        recommendedDeprecated,
        `Deprecated strategies marked as recommended:\n${recommendedDeprecated.join('\n')}`,
      ).toEqual([]);
    });
  });

  it('should contain valid frontmatter and referenced images', () => {
    const errors: string[] = [];
    const siteDir = path.join(__dirname, '../../../site');

    for (const file of getDocumentationFiles()) {
      const relative = path.relative(path.join(__dirname, '../../..'), file);
      const contents = fs.readFileSync(file, 'utf8');
      const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

      if (!frontmatter) {
        errors.push(`${relative}: missing frontmatter`);
        continue;
      }

      try {
        const parsed = loadYaml(frontmatter[1]) as { description?: unknown } | undefined;
        if (typeof parsed?.description !== 'string' || parsed.description.trim().length === 0) {
          errors.push(`${relative}: missing frontmatter description`);
        } else if (parsed.description.length > 180) {
          errors.push(`${relative}: frontmatter description exceeds 180 characters`);
        }
      } catch (error) {
        errors.push(`${relative}: invalid frontmatter: ${String(error)}`);
      }

      for (const match of contents.matchAll(/!\[([^\]]*)\]\((\/img\/[^\s)]+)[^)]*\)/g)) {
        const [, alt, source] = match;
        if (!alt.trim()) {
          errors.push(`${relative}: image ${source} has empty alt text`);
        }
        if (!fs.existsSync(path.join(siteDir, 'static', source))) {
          errors.push(`${relative}: image ${source} does not exist`);
        }
      }
    }

    expect(
      errors,
      `Invalid redteam documentation frontmatter or images:\n${errors.join('\n')}`,
    ).toEqual([]);
  });

  it('should contain valid YAML and redteam config examples', () => {
    const errors: string[] = [];

    for (const file of getDocumentationFiles()) {
      for (const { line, yaml } of getYamlFences(file)) {
        const error = validateYamlFence(file, line, yaml);
        if (error) {
          errors.push(error);
        }
      }
    }

    expect(errors, `Invalid redteam documentation examples:\n${errors.join('\n')}`).toEqual([]);
  });
});
