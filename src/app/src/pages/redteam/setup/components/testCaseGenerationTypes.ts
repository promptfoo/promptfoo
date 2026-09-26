/**
 * Shared types and config normalization for test case generation.
 *
 * This file exists to prevent circular dependencies between:
 * - TestCaseGenerationProvider.tsx (defines context and provider)
 * - TestCaseDialog.tsx (consumes these types)
 *
 * By extracting shared types to this separate file, both modules can import
 * from here without creating import cycles.
 */

import { ALL_PLUGINS, type Plugin, type Strategy } from '@promptfoo/redteam/constants';
import {
  type PluginConfig,
  PluginConfigSchema,
  type StrategyConfig,
} from '@promptfoo/redteam/types';

import type { Config } from '../types';

export interface GeneratedTestCase {
  prompt: string;
  context?: string;
  metadata?: unknown;
}

export interface TargetResponse {
  output: string | null;
  error: string | null;
}

export interface TargetPlugin {
  id: Plugin;
  config: PluginConfig;
  isStatic: boolean;
}

export interface TargetStrategy {
  id: Strategy;
  config: StrategyConfig;
  isStatic: boolean;
}

const DEFAULT_TEST_GENERATION_PLUGIN: Plugin = 'harmful:hate';

function hasUsablePolicy(config: PluginConfig): boolean {
  const policy = config.policy;
  if (typeof policy === 'string') {
    return policy.trim().length > 0;
  }
  return Boolean(policy && policy.text?.trim());
}

function isValidTestGenerationPlugin(id: string, config: PluginConfig): boolean {
  return ALL_PLUGINS.includes(id as Plugin) && PluginConfigSchema.safeParse(config).success;
}

export function normalizeTestGenerationPlugins(
  configuredPlugins: Config['plugins'] | undefined,
): TargetPlugin[] {
  const plugins = (configuredPlugins ?? []).flatMap<TargetPlugin>((configuredPlugin) => {
    if (typeof configuredPlugin === 'string') {
      if (configuredPlugin === 'policy' || !isValidTestGenerationPlugin(configuredPlugin, {})) {
        return [];
      }
      return [{ id: configuredPlugin as Plugin, config: {}, isStatic: true }];
    }
    if (
      !configuredPlugin ||
      typeof configuredPlugin.id !== 'string' ||
      !isValidTestGenerationPlugin(
        configuredPlugin.id,
        configuredPlugin.config && typeof configuredPlugin.config === 'object'
          ? configuredPlugin.config
          : {},
      )
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
