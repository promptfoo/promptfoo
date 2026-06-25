import { type Plugin } from '@promptfoo/redteam/constants';
import type { PluginConfig } from '@promptfoo/redteam/types';

import type { Config } from '../types';
import type { TargetPlugin } from './testCaseGenerationTypes';

export const DEFAULT_TEST_GENERATION_PLUGIN: Plugin = 'harmful:hate';

function hasUsablePolicy(config: PluginConfig): boolean {
  const policy = config.policy;
  if (typeof policy === 'string') {
    return policy.trim().length > 0;
  }
  return Boolean(
    policy &&
      typeof policy.id === 'string' &&
      policy.id.trim().length > 0 &&
      typeof policy.text === 'string' &&
      policy.text.trim().length > 0,
  );
}

export function normalizeTestGenerationPlugins(
  configuredPlugins: Config['plugins'] | undefined,
): TargetPlugin[] {
  const plugins = (configuredPlugins ?? []).flatMap<TargetPlugin>((configuredPlugin) => {
    if (typeof configuredPlugin === 'string') {
      if (!configuredPlugin.trim() || configuredPlugin === 'policy') {
        return [];
      }
      return [{ id: configuredPlugin as Plugin, config: {}, isStatic: true }];
    }
    if (
      !configuredPlugin ||
      typeof configuredPlugin.id !== 'string' ||
      !configuredPlugin.id.trim()
    ) {
      return [];
    }

    const config =
      configuredPlugin.config && typeof configuredPlugin.config === 'object'
        ? configuredPlugin.config
        : {};
    if (configuredPlugin.id === 'policy' && !hasUsablePolicy(config)) {
      return [];
    }

    return [
      {
        id: configuredPlugin.id as Plugin,
        config,
        isStatic: true,
      },
    ];
  });

  return plugins.length > 0
    ? plugins
    : [{ id: DEFAULT_TEST_GENERATION_PLUGIN, config: {}, isStatic: true }];
}
