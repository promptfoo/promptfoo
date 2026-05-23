import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { isProviderConfigFileReference, normalizeProviderRef } from '../../../util/providerRef';
import { renderEnvOnlyInObject } from '../../../util/render';
import { ConfigurationError } from './errors';

import type { EnvOverrides } from '../../../types/env';

/**
 * Security utilities for MCP server operations
 */

const FILE_PROVIDER_PREFIX = 'file://';
const LOCAL_PROVIDER_PREFIXES = ['exec:', 'golang:', 'python:', 'ruby:'] as const;
const STATIC_CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);
const PROVIDER_FILE_EXTENSIONS = new Set([
  'cjs',
  'cts',
  'go',
  'js',
  'json',
  'mjs',
  'mts',
  'py',
  'rb',
  'ts',
  'yaml',
  'yml',
]);

/**
 * Validates that a file path is safe and within allowed boundaries.
 *
 * @param filePath - The file path to validate
 * @param basePath - Optional base directory to constrain paths within
 */
export function validateFilePath(filePath: string, basePath?: string): void {
  // Check for path traversal attempts BEFORE normalization
  // This prevents bypasses like "/tmp/../etc/passwd" which normalizes to "/etc/passwd"
  if (filePath.includes('..') || filePath.includes('~')) {
    throw new ConfigurationError(
      'Path traversal detected. Paths cannot contain ".." or "~"',
      filePath,
    );
  }

  // Normalize the path after traversal check
  const normalizedPath = path.normalize(filePath);

  // If a base path is provided, ensure the resolved path stays within it
  if (basePath) {
    const resolvedBase = path.resolve(basePath);
    const resolvedPath = path.resolve(basePath, filePath);
    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
      throw new ConfigurationError(`Path must be within base directory: ${basePath}`, filePath);
    }
  }

  // Check absolute paths - only allow if they don't target system directories
  const isAbsolute = path.isAbsolute(normalizedPath);

  // Check for suspicious system directory patterns
  const suspiciousPatterns = [
    /^\/etc\//,
    /^\/sys\//,
    /^\/proc\//,
    /^\/var\/run\//,
    /^\/dev\//,
    /^C:\\Windows\\/i,
    /^C:\\Program Files\\/i,
    /^C:\\ProgramData\\/i,
  ];

  if (isAbsolute && suspiciousPatterns.some((pattern) => pattern.test(normalizedPath))) {
    throw new ConfigurationError('Access to system directories is not allowed', filePath);
  }
}

/**
 * Validates a caller-supplied MCP file path against the current working directory.
 *
 * MCP clients run as separate local processes, so tools should not read or write
 * arbitrary host paths outside the project the user selected when starting the
 * MCP server.
 */
export function validateMcpFilePath(filePath: string, resolutionBasePath = process.cwd()): void {
  const basePath = process.cwd();
  validateFilePath(filePath);

  const resolvedBase = fs.realpathSync(basePath);
  const resolvedPath = path.resolve(resolutionBasePath, filePath);
  let existingPath = resolvedPath;

  while (!fs.existsSync(existingPath)) {
    const parentPath = path.dirname(existingPath);
    if (parentPath === existingPath) {
      break;
    }
    existingPath = parentPath;
  }

  const realExistingPath = fs.realpathSync(existingPath);
  const relativePath = path.relative(resolvedBase, realExistingPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new ConfigurationError(`Path must be within base directory: ${basePath}`, filePath);
  }
}

function hasProviderFileExtension(filePath: string): boolean {
  return PROVIDER_FILE_EXTENSIONS.has(path.extname(filePath).slice(1).toLowerCase());
}

function stripProviderFileExport(providerPath: string): string {
  const lowerProviderPath = providerPath.toLowerCase();
  let filePathEnd = -1;

  for (const extension of PROVIDER_FILE_EXTENSIONS) {
    const exportMarker = `.${extension}:`;
    const markerIndex = lowerProviderPath.lastIndexOf(exportMarker);
    if (markerIndex !== -1) {
      filePathEnd = Math.max(filePathEnd, markerIndex + exportMarker.length - 1);
    }
  }

  return filePathEnd === -1 ? providerPath : providerPath.slice(0, filePathEnd);
}

function getLocalProviderPath(providerId: string): string | undefined {
  for (const prefix of LOCAL_PROVIDER_PREFIXES) {
    if (providerId.startsWith(prefix)) {
      return stripProviderFileExport(providerId.slice(prefix.length));
    }
  }

  const providerPath = providerId.startsWith(FILE_PROVIDER_PREFIX)
    ? providerId.slice(FILE_PROVIDER_PREFIX.length)
    : providerId;
  const filePath = stripProviderFileExport(providerPath);
  return hasProviderFileExtension(filePath) ? filePath : undefined;
}

function renderProviderIdForValidation(providerId: string, env?: EnvOverrides): string {
  const renderedProviderId = renderEnvOnlyInObject(providerId, env);
  if (renderedProviderId.includes('{{') || renderedProviderId.includes('{%')) {
    throw new ConfigurationError(
      'Invalid provider ID format: provider ID templates must resolve before MCP validation',
    );
  }
  return renderedProviderId;
}

interface ProviderValidationState {
  basePath: string;
  env?: EnvOverrides;
  validatedConfigFiles: Set<string>;
}

function asEnvOverrides(value: unknown): EnvOverrides | undefined {
  return typeof value === 'object' && value !== null ? (value as EnvOverrides) : undefined;
}

function mergeProviderEnv(
  lowerPrecedenceEnv: unknown,
  higherPrecedenceEnv: unknown,
): EnvOverrides | undefined {
  const lower = asEnvOverrides(lowerPrecedenceEnv);
  const higher = asEnvOverrides(higherPrecedenceEnv);
  return lower || higher ? { ...lower, ...higher } : undefined;
}

function validateFileReferencesInValue(value: unknown, state: ProviderValidationState): void {
  if (typeof value === 'string') {
    if (!value.startsWith(FILE_PROVIDER_PREFIX)) {
      return;
    }

    const renderedFileReference = renderProviderIdForValidation(value, state.env);
    const referencedPath = stripProviderFileExport(
      renderedFileReference.slice(FILE_PROVIDER_PREFIX.length),
    );
    validateMcpFilePath(referencedPath, state.basePath);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => validateFileReferencesInValue(entry, state));
    return;
  }

  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((entry) => validateFileReferencesInValue(entry, state));
  }
}

function validateProviderReferenceWithState(
  provider: unknown,
  state: ProviderValidationState,
  nestedProviderFile = false,
): void {
  if (typeof provider === 'string') {
    validateProviderIdWithState(provider, state);
    return;
  }

  const descriptor = normalizeProviderRef(provider);
  if (descriptor.kind !== 'options' && descriptor.kind !== 'map') {
    return;
  }

  // For a nested file-backed provider, the outer context env overrides defaults
  // from the loaded file, matching loadApiProvider's recursive merge behavior.
  const env = nestedProviderFile
    ? mergeProviderEnv(descriptor.loadOptions.env, state.env)
    : mergeProviderEnv(state.env, descriptor.loadOptions.env);
  const providerState = { ...state, env };

  validateFileReferencesInValue(descriptor.loadOptions, providerState);
  validateProviderIdWithState(descriptor.loadProviderPath, providerState);
}

function validateProviderConfigFile(providerPath: string, state: ProviderValidationState): void {
  if (!isProviderConfigFileReference(`${FILE_PROVIDER_PREFIX}${providerPath}`)) {
    return;
  }

  const resolvedProviderPath = path.resolve(state.basePath, providerPath);
  if (!fs.existsSync(resolvedProviderPath)) {
    return;
  }

  const realProviderPath = fs.realpathSync(resolvedProviderPath);
  if (state.validatedConfigFiles.has(realProviderPath)) {
    return;
  }
  state.validatedConfigFiles.add(realProviderPath);

  const rawConfig = yaml.load(fs.readFileSync(realProviderPath, 'utf8'));
  const configs = Array.isArray(rawConfig) ? rawConfig : [rawConfig];
  for (const config of configs) {
    validateProviderReferenceWithState(config, state, true);
  }
}

function parseCommandParts(command: string): string[] {
  return [...command.matchAll(/[^\s"']+|"([^"]*)"|'([^']*)'/g)].map(
    (match) => match[1] ?? match[2] ?? match[0],
  );
}

function validateExecProviderId(providerId: string, state: ProviderValidationState): void {
  const commandParts = parseCommandParts(providerId.slice('exec:'.length));
  if (commandParts.length === 0) {
    throw new ConfigurationError(`Invalid provider ID format: ${providerId}`);
  }

  for (const part of commandParts) {
    if (
      path.isAbsolute(part) ||
      part.includes('/') ||
      part.includes('\\') ||
      hasProviderFileExtension(part)
    ) {
      validateMcpFilePath(stripProviderFileExport(part), state.basePath);
    }
  }
}

function validateProviderIdWithState(providerId: string, state: ProviderValidationState): void {
  if (!providerId || /[\0\r\n]/.test(providerId)) {
    throw new ConfigurationError('Invalid provider ID format: provider ID cannot be empty');
  }

  const renderedProviderId = renderProviderIdForValidation(providerId, state.env);
  if (renderedProviderId.includes('..') || renderedProviderId.includes('~')) {
    throw new ConfigurationError(
      'Invalid provider ID format: provider IDs cannot contain ".." or "~"',
    );
  }

  if (renderedProviderId.startsWith('exec:')) {
    validateExecProviderId(renderedProviderId, state);
    return;
  }

  if (/\s/.test(renderedProviderId)) {
    throw new ConfigurationError(`Invalid provider ID format: ${renderedProviderId}`);
  }

  if (/^https?:\/\//i.test(renderedProviderId)) {
    try {
      const url = new URL(renderedProviderId);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return;
      }
    } catch {
      throw new ConfigurationError(`Invalid provider URL: ${renderedProviderId}`);
    }
  }

  const providerPath = getLocalProviderPath(renderedProviderId);
  if (providerPath !== undefined) {
    if (!providerPath) {
      throw new ConfigurationError(`Invalid provider ID format: ${renderedProviderId}`);
    }
    validateMcpFilePath(providerPath, state.basePath);
    validateProviderConfigFile(providerPath, state);
    return;
  }

  if (renderedProviderId.startsWith(FILE_PROVIDER_PREFIX)) {
    throw new ConfigurationError(
      `Invalid provider ID format: ${renderedProviderId}. Expected a supported provider file.`,
    );
  }
}

/**
 * Validates provider ID format
 */
export function validateProviderId(providerId: string, env?: EnvOverrides): void {
  validateProviderIdWithState(providerId, {
    basePath: process.cwd(),
    env,
    validatedConfigFiles: new Set(),
  });
}

/**
 * Validates an MCP-supplied provider string or options object before provider loading.
 */
export function validateProviderReference(provider: unknown, env?: EnvOverrides): void {
  validateProviderReferenceWithState(provider, {
    basePath: process.cwd(),
    env,
    validatedConfigFiles: new Set(),
  });
}

/**
 * Validates static promptfoo configuration contents before resolution can read
 * referenced prompt, test, transform, or provider files.
 */
export function validateMcpConfigFile(configPath: string): void {
  validateMcpFilePath(configPath);

  const resolvedConfigPath = path.resolve(process.cwd(), configPath);
  if (
    !STATIC_CONFIG_EXTENSIONS.has(path.extname(resolvedConfigPath).toLowerCase()) ||
    !fs.existsSync(resolvedConfigPath)
  ) {
    return;
  }

  const rawConfig = yaml.load(fs.readFileSync(resolvedConfigPath, 'utf8'));
  const rootConfig =
    typeof rawConfig === 'object' && rawConfig !== null
      ? (rawConfig as Record<string, unknown>)
      : undefined;
  const state: ProviderValidationState = {
    basePath: path.dirname(resolvedConfigPath),
    env: asEnvOverrides(rootConfig?.env),
    validatedConfigFiles: new Set(),
  };

  validateFileReferencesInValue(rawConfig, state);
  const providers = rootConfig?.providers ?? rootConfig?.targets;
  if (Array.isArray(providers)) {
    providers.forEach((provider) => validateProviderReferenceWithState(provider, state));
  } else if (providers !== undefined) {
    validateProviderReferenceWithState(providers, state);
  }
}
