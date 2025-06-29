#!/usr/bin/env tsx
/**
 * Script to verify that plugins are synchronized between:
 * - src/redteam/constants/plugins.ts (source of truth)
 * - site/docs/_shared/data/plugins.ts (documentation)
 *
 * This script is used in CI/CD to ensure documentation stays in sync with code.
 */
import * as fs from 'fs';
import * as path from 'path';

// ANSI color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

function error(message: string): void {
  console.error(`${colors.red}✗ ${message}${colors.reset}`);
}

function success(message: string): void {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function warning(message: string): void {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

async function loadPluginsFromConstants(): Promise<Set<string>> {
  const constantsPath = path.join(__dirname, '..', 'src', 'redteam', 'constants', 'plugins.ts');

  if (!fs.existsSync(constantsPath)) {
    throw new Error(`Constants file not found at: ${constantsPath}`);
  }

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
  ];

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

  // Note: We don't include COLLECTIONS here as they are not individual plugins
  // but rather groupings of plugins

  return allPlugins;
}

async function loadPluginsFromDocs(): Promise<Set<string>> {
  const docsPath = path.join(__dirname, '..', 'site', 'docs', '_shared', 'data', 'plugins.ts');

  if (!fs.existsSync(docsPath)) {
    throw new Error(`Docs file not found at: ${docsPath}`);
  }

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

async function main(): Promise<void> {
  try {
    console.log('Verifying plugin synchronization...\n');

    const constantsPlugins = await loadPluginsFromConstants();
    const docsPlugins = await loadPluginsFromDocs();

    console.log(`Found ${constantsPlugins.size} plugins in constants file`);
    console.log(`Found ${docsPlugins.size} plugins in docs file\n`);

    // Find plugins missing from docs
    const missingFromDocs = [...constantsPlugins].filter((plugin) => !docsPlugins.has(plugin));

    // Find plugins missing from constants
    const missingFromConstants = [...docsPlugins].filter((plugin) => !constantsPlugins.has(plugin));

    let hasErrors = false;

    if (missingFromDocs.length > 0) {
      hasErrors = true;
      error(`${missingFromDocs.length} plugins missing from documentation:`);
      missingFromDocs.forEach((plugin) => {
        console.log(`  - ${plugin}`);
      });
      console.log();
    }

    if (missingFromConstants.length > 0) {
      hasErrors = true;
      error(`${missingFromConstants.length} plugins missing from constants:`);
      missingFromConstants.forEach((plugin) => {
        console.log(`  - ${plugin}`);
      });
      console.log();
    }

    if (!hasErrors) {
      success('All plugins are properly synchronized!');
      console.log(`\nTotal plugins: ${constantsPlugins.size}`);
      process.exit(0);
    } else {
      error('Plugin synchronization check failed!');
      console.log('\nTo fix this issue:');
      if (missingFromDocs.length > 0) {
        console.log('1. Add missing plugins to site/docs/_shared/data/plugins.ts');
      }
      if (missingFromConstants.length > 0) {
        console.log(
          '2. Add missing plugins to src/redteam/constants/plugins.ts or remove them from docs',
        );
      }
      process.exit(1);
    }
  } catch (err) {
    error(`Script failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Run the script
main();
