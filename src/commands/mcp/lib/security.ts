import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { DEFAULT_CONFIG_EXTENSIONS } from '../../../util/config/extensions';
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
const CONFIG_FILE_REFERENCE_EXTENSIONS = new Set([
  ...PROVIDER_FILE_EXTENSIONS,
  'bash',
  'bat',
  'cmd',
  'csv',
  'j2',
  'jsonl',
  'md',
  'pl',
  'ps1',
  'sh',
  'txt',
  'xls',
  'xlsx',
]);
const REMOTE_CONFIG_REFERENCE_PATTERN =
  /^(?:https?:\/\/|az:\/\/|huggingface:\/\/datasets\/|git\+https?:\/\/)/i;
const INLINE_EXECUTION_FLAGS = new Set([
  '-c',
  '/c',
  '-command',
  '--command',
  '-e',
  '--eval',
  '--exec',
  '-p',
  '--print',
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

function stripFileExport(filePath: string, extensions: ReadonlySet<string>): string {
  const lowerFilePath = filePath.toLowerCase();
  let filePathEnd = -1;

  for (const extension of extensions) {
    const exportMarker = `.${extension}:`;
    const markerIndex = lowerFilePath.lastIndexOf(exportMarker);
    if (markerIndex !== -1) {
      filePathEnd = Math.max(filePathEnd, markerIndex + exportMarker.length - 1);
    }
  }

  return filePathEnd === -1 ? filePath : filePath.slice(0, filePathEnd);
}

function stripProviderFileExport(providerPath: string): string {
  return stripFileExport(providerPath, PROVIDER_FILE_EXTENSIONS);
}

function stripConfigFileExport(filePath: string): string {
  return stripFileExport(filePath, CONFIG_FILE_REFERENCE_EXTENSIONS);
}

function hasConfigFileExtension(filePath: string): boolean {
  return CONFIG_FILE_REFERENCE_EXTENSIONS.has(path.extname(filePath).slice(1).toLowerCase());
}

function isLocalConfigFileReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || REMOTE_CONFIG_REFERENCE_PATTERN.test(trimmed)) {
    return false;
  }

  if (trimmed.startsWith(FILE_PROVIDER_PREFIX) || trimmed.startsWith('exec:')) {
    return true;
  }

  const filePath = stripConfigFileExport(trimmed);
  return (
    path.isAbsolute(filePath) ||
    filePath.startsWith('./') ||
    filePath.startsWith('../') ||
    filePath.startsWith('~/') ||
    filePath.includes('\\') ||
    filePath.includes('*') ||
    hasConfigFileExtension(filePath)
  );
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

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function renderConfigFileReferenceForValidation(value: string, state: ProviderValidationState) {
  const rendered = renderEnvOnlyInObject(value, state.env);
  if (rendered.includes('{{') || rendered.includes('{%')) {
    throw new ConfigurationError(
      'Invalid config file reference: path templates must resolve before MCP validation',
    );
  }
  return rendered;
}

function validateConfigFileReference(value: string, state: ProviderValidationState): void {
  const rendered = renderConfigFileReferenceForValidation(value, state);
  const withoutProtocol = rendered.startsWith(FILE_PROVIDER_PREFIX)
    ? rendered.slice(FILE_PROVIDER_PREFIX.length)
    : rendered;
  validateMcpFilePath(stripConfigFileExport(withoutProtocol), state.basePath);
}

function validateJsonSchemaRef(value: unknown, state: ProviderValidationState): void {
  if (typeof value !== 'string') {
    return;
  }

  const renderedRef = renderConfigFileReferenceForValidation(value, state);
  if (!renderedRef || renderedRef.startsWith('#')) {
    return;
  }

  const [refPath] = renderedRef.split('#', 1);
  if (!refPath) {
    return;
  }

  if (REMOTE_CONFIG_REFERENCE_PATTERN.test(refPath)) {
    throw new ConfigurationError('External $ref URLs are not allowed in MCP configs', refPath);
  }

  validateConfigFileReference(refPath, state);
}

function validateFileReferencesInValue(value: unknown, state: ProviderValidationState): void {
  if (typeof value === 'string') {
    if (value.startsWith(FILE_PROVIDER_PREFIX)) {
      validateConfigFileReference(value, state);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => validateFileReferencesInValue(entry, state));
    return;
  }

  const object = getObject(value);
  if (object) {
    for (const [key, entry] of Object.entries(object)) {
      if (key === '$ref') {
        validateJsonSchemaRef(entry, state);
      }
      validateFileReferencesInValue(entry, state);
    }
  }
}

function validateExecConfigFileReference(value: string, state: ProviderValidationState): void {
  const commandParts = parseCommandParts(value.slice('exec:'.length));
  if (!commandParts.length) {
    throw new ConfigurationError('Invalid config file reference: exec prompt is empty');
  }

  let hasWorkspaceScript = false;
  for (const part of commandParts) {
    if (isInlineExecutionFlag(part)) {
      throw new ConfigurationError(
        'Invalid config file reference: exec prompts used through MCP must reference a workspace script file, not inline code',
      );
    }

    if (
      path.isAbsolute(part) ||
      part.includes('/') ||
      part.includes('\\') ||
      hasConfigFileExtension(part)
    ) {
      validateConfigFileReference(part, state);
      hasWorkspaceScript = true;
    }
  }

  if (!hasWorkspaceScript) {
    throw new ConfigurationError(
      'Invalid config file reference: exec prompts used through MCP must reference a workspace script file',
    );
  }
}

function validateLocalConfigFileReferences(
  value: unknown,
  state: ProviderValidationState,
  recurseObjectValues = false,
): void {
  if (typeof value === 'string') {
    if (isLocalConfigFileReference(value)) {
      if (value.startsWith('exec:')) {
        validateExecConfigFileReference(value, state);
      } else {
        validateConfigFileReference(value, state);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => validateLocalConfigFileReferences(entry, state, recurseObjectValues));
    return;
  }

  const object = getObject(value);
  if (object) {
    if (typeof object.path === 'string') {
      validateLocalConfigFileReferences(object.path, state);
    }
    if (typeof object.file === 'string') {
      validateLocalConfigFileReferences(object.file, state);
    }
    if (recurseObjectValues) {
      Object.values(object).forEach((entry) =>
        validateLocalConfigFileReferences(entry, state, recurseObjectValues),
      );
    }
  }
}

function validateStaticConfigLocalReferences(
  rootConfig: Record<string, unknown>,
  state: ProviderValidationState,
): void {
  validateLocalConfigFileReferences(rootConfig.prompts, state);
  validateLocalConfigFileReferences(rootConfig.tests, state);
  validateLocalConfigFileReferences(rootConfig.outputPath, state);
  validateLocalConfigFileReferences(rootConfig.extensions, state, true);
  validateLocalConfigFileReferences(rootConfig.nunjucksFilters, state, true);
}

function isMcpProviderId(providerId: string): boolean {
  return providerId === 'mcp' || providerId.startsWith('mcp:');
}

function validateMcpServerConfig(server: unknown, state: ProviderValidationState): void {
  const serverConfig = getObject(server);
  if (!serverConfig) {
    return;
  }

  if (typeof serverConfig.path === 'string') {
    validateConfigFileReference(serverConfig.path, state);
  }

  if (typeof serverConfig.command === 'string' || serverConfig.args !== undefined) {
    throw new ConfigurationError(
      'MCP server command configs are not allowed through MCP tools; use a workspace-local server path instead',
    );
  }
}

function validateMcpConfigObject(config: unknown, state: ProviderValidationState): void {
  const mcpConfig = getObject(config);
  if (!mcpConfig) {
    return;
  }

  validateMcpServerConfig(mcpConfig.server, state);
  if (Array.isArray(mcpConfig.servers)) {
    mcpConfig.servers.forEach((server) => validateMcpServerConfig(server, state));
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
  const renderedProviderId = renderProviderIdForValidation(
    descriptor.loadProviderPath,
    providerState.env,
  );
  if (isMcpProviderId(renderedProviderId)) {
    validateMcpConfigObject(descriptor.loadOptions.config, providerState);
  }
  const configObject = getObject(descriptor.loadOptions.config);
  validateMcpConfigObject(configObject?.mcp, providerState);
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

function isInlineExecutionFlag(part: string): boolean {
  return INLINE_EXECUTION_FLAGS.has(part.toLowerCase());
}

function validateExecProviderId(providerId: string, state: ProviderValidationState): void {
  const commandParts = parseCommandParts(providerId.slice('exec:'.length));
  if (commandParts.length === 0) {
    throw new ConfigurationError(`Invalid provider ID format: ${providerId}`);
  }

  let hasWorkspaceScript = false;
  for (const part of commandParts) {
    if (isInlineExecutionFlag(part)) {
      throw new ConfigurationError(
        'Invalid provider ID format: exec providers used through MCP must reference a workspace script file, not inline code',
      );
    }

    if (
      path.isAbsolute(part) ||
      part.includes('/') ||
      part.includes('\\') ||
      hasProviderFileExtension(part)
    ) {
      validateMcpFilePath(stripProviderFileExport(part), state.basePath);
      hasWorkspaceScript = true;
    }
  }

  if (!hasWorkspaceScript) {
    throw new ConfigurationError(
      'Invalid provider ID format: exec providers used through MCP must reference a workspace script file',
    );
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
  validateStaticConfigLocalReferences(rootConfig ?? {}, state);
  const providers = rootConfig?.providers ?? rootConfig?.targets;
  if (Array.isArray(providers)) {
    providers.forEach((provider) => validateProviderReferenceWithState(provider, state));
  } else if (providers !== undefined) {
    validateProviderReferenceWithState(providers, state);
  }
}

export function validateDefaultMcpConfigFile(): void {
  for (const extension of DEFAULT_CONFIG_EXTENSIONS) {
    const configPath = path.join(process.cwd(), `promptfooconfig.${extension}`);
    if (fs.existsSync(configPath)) {
      validateMcpConfigFile(configPath);
      return;
    }
  }
}
