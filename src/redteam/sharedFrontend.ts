// This file is imported by the frontend and shouldn't use native dependencies.

import {
  MULTI_TURN_STRATEGIES,
  type Plugin,
  riskCategorySeverityMap,
  type Severity,
} from './constants';

import type { ProviderOptions, UnifiedConfig, Vars } from '../types/index';
import type { RedteamPluginObject, SavedRedteamConfig } from './types';

export function getRiskCategorySeverityMap(
  plugins?: RedteamPluginObject[],
): Record<Plugin, Severity> {
  const overrides =
    plugins?.reduce<Partial<Record<Plugin, Severity>>>((acc, plugin) => {
      if (plugin.severity) {
        acc[plugin.id as Plugin] = plugin.severity;

        // For 'policy' plugins, also add an entry for the specific policy ID.
        // This allows the severity to be looked up by the deserialized policy ID
        // (which is what getPluginIdFromResult returns for policy results).
        const policyId = (plugin.config as { policy?: { id?: string } } | undefined)?.policy?.id;
        if (plugin.id === 'policy' && policyId) {
          acc[policyId as Plugin] = plugin.severity;
        }
      }
      return acc;
    }, {}) || {};

  return {
    ...riskCategorySeverityMap,
    ...overrides,
  };
}

export function getTargetForExecution(provider: ProviderOptions): ProviderOptions {
  const target = { ...provider, config: { ...provider.config } };

  if (
    !/^https?(?::|$)/.test(provider.id ?? '') ||
    !target.config.tls ||
    typeof target.config.tls !== 'object' ||
    Array.isArray(target.config.tls)
  ) {
    return target;
  }

  const tls = { ...target.config.tls };
  const certificateType = tls.certificateType;
  if (['none', 'pem', 'pfx', 'pkcs12', 'jks'].includes(certificateType)) {
    if (certificateType !== 'pem') {
      delete tls.cert;
      delete tls.certPath;
      delete tls.key;
      delete tls.keyPath;
    }
    if (certificateType !== 'pfx' && certificateType !== 'pkcs12') {
      delete tls.pfx;
      delete tls.pfxPath;
    }
    if (certificateType !== 'jks') {
      delete tls.jksContent;
      delete tls.jksPath;
      delete tls.keyAlias;
    }
    if (certificateType === 'none') {
      delete tls.passphrase;
    }
  }

  // Keep certificate data while removing the setup form's input state.
  delete tls.enabled;
  delete tls.certInputType;
  delete tls.keyInputType;
  delete tls.jksInputType;
  delete tls.pfxInputType;
  delete tls.caInputType;
  delete tls.jksFileName;
  delete tls.jksExtractConfigured;
  delete tls.certificateType;

  for (const key of ['ca', 'cert', 'key']) {
    if (Array.isArray(tls[key])) {
      const entries = tls[key].filter(
        (entry: unknown) => typeof entry !== 'string' || entry.trim() !== '',
      );
      tls[key] = entries.length ? entries : undefined;
    }
  }
  for (const key of Object.keys(tls)) {
    if (tls[key] === '' || tls[key] === undefined) {
      delete tls[key];
    }
  }
  if (Object.keys(tls).length) {
    target.config.tls = tls;
  } else {
    delete target.config.tls;
  }

  return target;
}

export function getUnifiedConfig(
  config: SavedRedteamConfig,
): UnifiedConfig & { redteam: NonNullable<UnifiedConfig['redteam']> } {
  const target = getTargetForExecution(config.target);
  delete target.config!.sessionSource;
  delete target.config!.stateful;
  const defaultTest = {
    ...(config.defaultTest ?? {}),
    options: {
      ...(config.defaultTest?.options ?? {}),
      transformVars: '{ ...vars, sessionId: context.uuid }',
    },
    vars: config.defaultTest?.vars as Record<string, Vars>,
  };

  return {
    description: config.description,
    targets: [target],
    prompts: config.prompts,
    extensions: config.extensions,
    defaultTest,
    redteam: {
      purpose: config.purpose,
      numTests: config.numTests,
      ...(config.maxCharsPerMessage && {
        maxCharsPerMessage: config.maxCharsPerMessage,
      }),
      ...(config.provider && { provider: config.provider }),
      ...(config.maxConcurrency && { maxConcurrency: config.maxConcurrency }),
      ...(config.language && { language: config.language }),
      ...(config.frameworks &&
        config.frameworks.length > 0 && {
          frameworks: Array.from(new Set(config.frameworks)),
        }),
      plugins: config.plugins.map((plugin): RedteamPluginObject => {
        if (typeof plugin === 'string') {
          return { id: plugin };
        }
        return {
          id: plugin.id,
          ...(plugin.config && Object.keys(plugin.config).length > 0 && { config: plugin.config }),
        };
      }),
      strategies: config.strategies.map((strategy) => {
        if (typeof strategy === 'string') {
          if (MULTI_TURN_STRATEGIES.includes(strategy as any) && config.target.config?.stateful) {
            return { id: strategy, config: { stateful: true } };
          }
          return { id: strategy };
        }

        // Determine if this is a stateful multi-turn strategy
        const isStatefulMultiTurn =
          MULTI_TURN_STRATEGIES.includes(strategy.id as any) && config.target.config?.stateful;

        // Check if we have any custom configuration
        const hasCustomConfig = strategy.config && Object.keys(strategy.config).length > 0;

        // If we don't need any configuration, return just the ID
        if (!isStatefulMultiTurn && !hasCustomConfig) {
          return { id: strategy.id };
        }

        // Build the configuration object
        const configObject = {
          ...(isStatefulMultiTurn && { stateful: true }),
          ...(strategy.config || {}),
        };

        // Return the strategy with its configuration
        return {
          id: strategy.id,
          config: configObject,
        };
      }),
      ...(config.testGenerationInstructions && {
        testGenerationInstructions: config.testGenerationInstructions,
      }),
    },
  };
}
