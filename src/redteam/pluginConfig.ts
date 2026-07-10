import * as fs from 'fs';

import { loadYaml } from '../util/yamlLoad';

/** Resolve top-level file references using the same semantics as plugin generation. */
export function resolvePluginConfig(config: Record<string, any> | undefined): Record<string, any> {
  if (!config) {
    return {};
  }

  for (const key in config) {
    const value = config[key];
    if (typeof value === 'string' && value.startsWith('file://')) {
      const filePath = value.slice('file://'.length);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      if (filePath.endsWith('.yaml')) {
        config[key] = loadYaml(fs.readFileSync(filePath, 'utf8'));
      } else if (filePath.endsWith('.json')) {
        config[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else {
        config[key] = fs.readFileSync(filePath, 'utf8');
      }
    }
  }
  return config;
}

export function resolvePluginForCompatibility(plugin: unknown): unknown {
  if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
    return plugin;
  }

  const { config, id } = plugin as { config?: unknown; id?: unknown };
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return plugin;
  }

  const compatibilityFiles = Object.fromEntries(
    [
      'excludeStrategies',
      'inputs',
      ...(id === 'intent' || id === 'promptfoo:redteam:intent' ? ['intent'] : []),
    ].flatMap((key) => {
      const value = (config as Record<string, unknown>)[key];
      return typeof value === 'string' && value.startsWith('file://') ? [[key, value]] : [];
    }),
  );
  if (Object.keys(compatibilityFiles).length === 0) {
    return plugin;
  }

  return {
    ...plugin,
    config: { ...config, ...resolvePluginConfig(compatibilityFiles) },
  };
}
