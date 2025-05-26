import fs from 'fs';
import path from 'path';
import {
  ALL_PLUGINS,
  BASE_PLUGINS,
  ADDITIONAL_PLUGINS,
  CONFIG_REQUIRED_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
} from '../../../src/redteam/constants';

describe('Plugin IDs', () => {
  const findPluginIdAssignments = (fileContent: string): string[] => {
    // Look for patterns like `id = 'plugin-name'` or `PLUGIN_ID = 'plugin-name'`
    const idAssignmentRegex = /\b(id|PLUGIN_ID)\s*=\s*['"]([^'"]+)['"]/g;
    const matches = [];
    let match;
    while ((match = idAssignmentRegex.exec(fileContent)) !== null) {
      matches.push(match[2]);
    }
    return matches;
  };

  it('should use plugin IDs that match those defined in constants', () => {
    // Get all plugin implementation files
    const pluginDir = path.resolve(__dirname, '../../../src/redteam/plugins');
    const pluginFiles = fs
      .readdirSync(pluginDir)
      .filter(
        (file) =>
          file.endsWith('.ts') &&
          !file.endsWith('.d.ts') &&
          file !== 'index.ts' &&
          file !== 'base.ts',
      );

    // Track all plugin IDs used in implementations
    const usedPluginIds: string[] = [];

    pluginFiles.forEach((file) => {
      const filePath = path.join(pluginDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const ids = findPluginIdAssignments(content);

      if (ids.length > 0) {
        usedPluginIds.push(...ids);
      }
    });

    // Also check subdirectories
    const subdirectories = fs
      .readdirSync(pluginDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    subdirectories.forEach((subdir) => {
      const subdirPath = path.join(pluginDir, subdir);
      const subFiles = fs
        .readdirSync(subdirPath)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts') && file !== 'index.ts');

      subFiles.forEach((file) => {
        const filePath = path.join(subdirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const ids = findPluginIdAssignments(content);

        if (ids.length > 0) {
          usedPluginIds.push(...ids);
        }
      });
    });

    // Filter out duplicates
    const uniqueIds = [...new Set(usedPluginIds)];

    // Create a comprehensive list of all expected plugin IDs, including the prefixed versions
    const expectedPrefixedPluginIds = new Set<string>();

    // Add common plugin format - 'promptfoo:redteam:plugin-name'
    ALL_PLUGINS.forEach((pluginId) => {
      if (typeof pluginId === 'string' && !pluginId.includes(':')) {
        expectedPrefixedPluginIds.add(`promptfoo:redteam:${pluginId}`);
      }
    });

    // Add harm plugins which might have different prefixes
    Object.keys(HARM_PLUGINS).forEach((harmPlugin) => {
      if (typeof harmPlugin === 'string') {
        const fullPluginId = `promptfoo:redteam:${harmPlugin}`;
        expectedPrefixedPluginIds.add(fullPluginId);
      }
    });

    // Add PII plugins with their prefixes
    PII_PLUGINS.forEach((piiPlugin) => {
      expectedPrefixedPluginIds.add(`promptfoo:redteam:${piiPlugin}`);
    });

    // Add special case for general PII plugin
    expectedPrefixedPluginIds.add('promptfoo:redteam:pii');

    // Add special case for general harmful plugin
    expectedPrefixedPluginIds.add('promptfoo:redteam:harmful');

    // Add special cases from harm sub-categories
    // These are handled specially in the constants file as nested objects
    uniqueIds.forEach((id) => {
      if (id.startsWith('promptfoo:redteam:harmful:')) {
        expectedPrefixedPluginIds.add(id);
      }
    });

    // Handle special case: 'policy' without prefix
    uniqueIds.forEach((id) => {
      if (id === 'policy') {
        // This is a special case where the ID is not prefixed in the code
        console.log("Note: Found 'policy' ID without prefix - this is a special case");
      }
    });

    // For each plugin ID found in the implementations, check if it matches an expected format
    const unexpectedPlugins: { id: string; baseId: string }[] = [];

    uniqueIds.forEach((id) => {
      if (!id.startsWith('promptfoo:redteam:') && id !== 'policy') {
        console.warn(
          `Plugin ID '${id}' does not start with the expected prefix 'promptfoo:redteam:'`,
        );
      }

      if (!expectedPrefixedPluginIds.has(id) && id !== 'policy') {
        const baseId = id.replace('promptfoo:redteam:', '');
        const isHarmSubcategory = baseId.startsWith('harmful:');

        // Special case for harm subcategories
        if (!isHarmSubcategory) {
          // Non-harm plugins should match one of the plugin types in constants
          const allPluginsList = [
            ...BASE_PLUGINS,
            ...ADDITIONAL_PLUGINS,
            ...CONFIG_REQUIRED_PLUGINS,
            ...PII_PLUGINS,
            'pii', // Add the general pii plugin
            'harmful', // Add the general harmful plugin
            ...Object.keys(HARM_PLUGINS),
          ];

          const matchesExpectedPlugin = allPluginsList.some((p) => baseId === p);

          if (!matchesExpectedPlugin) {
            console.warn(`Plugin ID '${id}' (base: '${baseId}') is not listed in constants`);
            unexpectedPlugins.push({ id, baseId });
          }
        }
      }
    });

    // Make a single assertion for all unexpected plugins
    expect(unexpectedPlugins).toEqual([]);
  });
});
