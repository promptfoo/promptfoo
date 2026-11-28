import * as fs from 'fs';
import * as path from 'path';

import { loadYaml } from '../util/yamlLoad';
import { CANARY_BREAKING_STRATEGY_IDS, UNALIGNED_PROVIDER_HARM_PLUGINS } from './constants';
import { DATASET_EXEMPT_PLUGINS, MULTI_INPUT_EXCLUDED_PLUGINS } from './constants/plugins';
import { Plugins } from './plugins/index';
import { TOOL_DISCOVERY_ATTACK_CONSTRAINTS } from './plugins/toolDiscovery';
import { neverGenerateRemote, shouldGenerateRemote } from './remoteGeneration';
import {
  getMaxCharsPerMessageModifierValue,
  MAX_CHARS_PER_MESSAGE_MODIFIER_KEY,
} from './shared/promptLength';

import type { RedteamFileConfig, RedteamPluginObject } from './types';

export const MAX_REMOTE_PLUGIN_CONFIG_BYTES = 30_000;

const unalignedHarmPluginIds = new Set<string>(Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS));
const multiInputExcludedPluginIds = new Set<string>([
  ...DATASET_EXEMPT_PLUGINS,
  ...MULTI_INPUT_EXCLUDED_PLUGINS,
]);

export interface RemotePluginValidationConfig {
  redteam?: RedteamFileConfig;
  targets?: unknown;
  providers?: unknown;
}

export interface RemotePluginValidationOptions {
  targetInputs?: Record<string, unknown>;
  rawConfig?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractFirstTargetInputs(
  config: RemotePluginValidationConfig,
  explicitInputs?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (isRecord(explicitInputs)) {
    return explicitInputs;
  }
  const targetList = Array.isArray(config.targets)
    ? config.targets
    : Array.isArray(config.providers)
      ? config.providers
      : [];
  const firstTarget = targetList[0];
  if (isRecord(firstTarget) && isRecord(firstTarget.inputs)) {
    return firstTarget.inputs;
  }
  return undefined;
}

function resolveRawTestGenerationInstructions(
  redteam: RedteamFileConfig,
  rawConfig?: unknown,
): string | undefined {
  if (typeof redteam.testGenerationInstructions === 'string') {
    return redteam.testGenerationInstructions;
  }
  if (
    isRecord(rawConfig) &&
    isRecord(rawConfig.redteam) &&
    typeof rawConfig.redteam.testGenerationInstructions === 'string'
  ) {
    return rawConfig.redteam.testGenerationInstructions;
  }
  return undefined;
}

function resolvePluginFileValue(fileRef: string, basePath?: string): unknown | undefined {
  const rawPath = fileRef.slice('file://'.length);
  const candidates =
    basePath && !path.isAbsolute(rawPath) ? [path.resolve(basePath, rawPath), rawPath] : [rawPath];

  const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolvedPath) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    // Match resolvePluginConfig in src/redteam/index.ts: only .yaml is parsed as YAML; .yml is raw text.
    if (resolvedPath.endsWith('.yaml')) {
      return loadYaml(content);
    }
    if (resolvedPath.endsWith('.json')) {
      return JSON.parse(content);
    }
    return content;
  } catch {
    return undefined;
  }
}

function resolvePluginConfigNonMutating(
  config: RedteamPluginObject['config'],
  basePath?: string,
): Record<string, unknown> {
  if (!config) {
    return {};
  }

  const resolved: Record<string, unknown> = { ...config };
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && value.startsWith('file://')) {
      const loaded = resolvePluginFileValue(value, basePath);
      if (loaded !== undefined) {
        resolved[key] = loaded;
      }
    }
  }
  return resolved;
}

function isRemoteGenerationSelectedForPlugin(pluginId: string): boolean {
  if (neverGenerateRemote()) {
    return false;
  }

  const pluginFactory = Plugins.find((p) => p.key === pluginId);
  if (!pluginFactory) {
    return false;
  }

  if (pluginFactory.requiresRemoteGeneration) {
    return true;
  }

  return pluginFactory.canGenerateRemote !== false && shouldGenerateRemote();
}

function buildSerializedConfigCandidates(
  plugin: RedteamPluginObject,
  redteam: RedteamFileConfig,
  basePath?: string,
  targetInputs?: Record<string, unknown>,
  rawTestGenerationInstructions?: string,
): Record<string, unknown>[] {
  const resolved = resolvePluginConfigNonMutating(plugin.config, basePath);
  const maxCharsPerMessage =
    (typeof resolved.maxCharsPerMessage === 'number' ? resolved.maxCharsPerMessage : undefined) ??
    redteam.maxCharsPerMessage;

  const instructions = rawTestGenerationInstructions ?? redteam.testGenerationInstructions;
  const baseModifiers: Record<string, string> = {
    ...(instructions ? { testGenerationInstructions: instructions } : {}),
    ...((resolved.modifiers as Record<string, string> | undefined) ?? {}),
  };
  const maxCharsModifier = getMaxCharsPerMessageModifierValue(maxCharsPerMessage);
  if (maxCharsModifier) {
    baseModifiers[MAX_CHARS_PER_MESSAGE_MODIFIER_KEY] = maxCharsModifier;
  }
  if (plugin.id === 'tool-discovery') {
    baseModifiers.toolDiscoveryAttackConstraints = TOOL_DISCOVERY_ATTACK_CONSTRAINTS;
  }

  const hasMultipleInputs = targetInputs && Object.keys(targetInputs).length > 0;
  const basePayload: Record<string, unknown> = {
    ...resolved,
    ...(maxCharsPerMessage ? { maxCharsPerMessage } : {}),
    ...(hasMultipleInputs ? { inputs: targetInputs } : {}),
    ...(Object.keys(baseModifiers).length > 0 ? { modifiers: baseModifiers } : {}),
  };

  if (plugin.id.startsWith('coding-agent:')) {
    const existingExcludes = Array.isArray(basePayload.excludeStrategies)
      ? (basePayload.excludeStrategies as string[])
      : [];
    basePayload.excludeStrategies = [
      ...new Set([...CANARY_BREAKING_STRATEGY_IDS, ...existingExcludes]),
    ];
  }

  // fetchRemoteTestCases strips graderExamples before serializing; unaligned harm sends config directly.
  if (!unalignedHarmPluginIds.has(plugin.id)) {
    delete basePayload.graderExamples;
  }

  const configuredLanguage = (plugin.config?.language ?? redteam.language) as
    | string
    | string[]
    | undefined;
  const languages = Array.isArray(configuredLanguage)
    ? configuredLanguage
    : configuredLanguage
      ? [configuredLanguage]
      : [undefined];

  return languages.map((lang) => (lang ? { ...basePayload, language: lang } : basePayload));
}

function measureSerializedConfigBytes(payload: Record<string, unknown>): number {
  const serialized = JSON.stringify(payload);
  return serialized ? Buffer.byteLength(serialized, 'utf8') : 0;
}

/**
 * Validates that redteam plugin configs targeting remote generation fit within
 * the remote generation API's serialized UTF-8 byte limit.
 */
export function validateRedteamRemotePluginConfigSizes(
  config: RemotePluginValidationConfig,
  basePath?: string,
  options?: RemotePluginValidationOptions,
): string[] {
  const redteam = config.redteam;
  if (!redteam?.plugins?.length) {
    return [];
  }

  const resolvedInputs = extractFirstTargetInputs(config, options?.targetInputs);
  const rawTestGenerationInstructions = resolveRawTestGenerationInstructions(
    redteam,
    options?.rawConfig,
  );
  const hasMultipleInputs = Boolean(resolvedInputs && Object.keys(resolvedInputs).length > 0);
  const errors: string[] = [];

  for (const pluginEntry of redteam.plugins) {
    if (typeof pluginEntry === 'string') {
      continue;
    }

    if (hasMultipleInputs && multiInputExcludedPluginIds.has(pluginEntry.id)) {
      continue;
    }

    if (!isRemoteGenerationSelectedForPlugin(pluginEntry.id)) {
      continue;
    }

    const candidates = buildSerializedConfigCandidates(
      pluginEntry,
      redteam,
      basePath,
      resolvedInputs,
      rawTestGenerationInstructions,
    );
    const maxByteLength = candidates.reduce(
      (maxBytes, candidate) => Math.max(maxBytes, measureSerializedConfigBytes(candidate)),
      0,
    );

    if (maxByteLength > MAX_REMOTE_PLUGIN_CONFIG_BYTES) {
      errors.push(
        `Redteam plugin "${pluginEntry.id}" config serializes to ${maxByteLength} UTF-8 bytes, exceeding the ${MAX_REMOTE_PLUGIN_CONFIG_BYTES}-byte limit for remote generation.`,
      );
    }
  }

  return errors;
}
