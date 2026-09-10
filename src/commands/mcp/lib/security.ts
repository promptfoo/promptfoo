import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';
import { parseScriptParts } from '../../../providers/scriptCompletion';
import { DEFAULT_CONFIG_EXTENSIONS } from '../../../util/config/extensions';
import { isProviderConfigFileReference, normalizeProviderRef } from '../../../util/providerRef';
import { renderEnvOnlyInObject } from '../../../util/render';
import { loadYaml } from '../../../util/yamlLoad';
import { ConfigurationError } from './errors';

type EnvOverrides = Record<string, string | undefined>;

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
  '-m',
  '--command',
  '-e',
  '--eval',
  '--exec',
  '-p',
  '--print',
]);
const PRELOAD_EXECUTION_FLAGS = new Set([
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader',
]);

/**
 * Validates a caller-supplied MCP file path against the current working directory.
 *
 * MCP clients run as separate local processes, so tools should not read or write
 * arbitrary host paths outside the project the user selected when starting the
 * MCP server.
 */
function validateMcpFilePathWithinWorkspace(
  filePath: string,
  basePath: string,
  resolutionBasePath: string,
): void {
  const resolvedBase = fs.realpathSync(basePath);
  const resolvedPath = path.resolve(resolutionBasePath, filePath);
  let existingPath = resolvedPath;

  for (;;) {
    try {
      fs.lstatSync(existingPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const parentPath = path.dirname(existingPath);
      if (parentPath === existingPath) {
        throw new ConfigurationError('Path does not have an existing parent', filePath);
      }
      existingPath = parentPath;
    }
  }

  let realExistingPath: string;
  try {
    realExistingPath = fs.realpathSync(existingPath);
  } catch {
    throw new ConfigurationError('Path contains a dangling or inaccessible symlink', filePath);
  }
  const relativePath = path.relative(resolvedBase, realExistingPath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new ConfigurationError(`Path must be within base directory: ${basePath}`, filePath);
  }
}

export function validateMcpFilePath(filePath: string, resolutionBasePath = process.cwd()): void {
  validateMcpFilePathWithinWorkspace(filePath, process.cwd(), resolutionBasePath);
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
  refBasePath?: string;
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
  const filePath = stripConfigFileExport(withoutProtocol);
  const matches = globSync(filePath, {
    absolute: true,
    cwd: state.basePath,
    nodir: true,
    windowsPathsNoEscape: true,
  });
  for (const candidate of matches.length ? matches : [filePath]) {
    validateMcpFilePath(candidate, state.basePath);
  }
}

function resolveConfigFileReference(value: string, state: ProviderValidationState): string {
  const rendered = renderConfigFileReferenceForValidation(value, state);
  const withoutProtocol = rendered.startsWith(FILE_PROVIDER_PREFIX)
    ? rendered.slice(FILE_PROVIDER_PREFIX.length)
    : rendered;
  const filePath = stripConfigFileExport(withoutProtocol);
  validateMcpFilePath(filePath, state.basePath);
  return path.resolve(state.basePath, filePath);
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

  const resolvedRefPath = resolveConfigFileReference(refPath, {
    ...state,
    basePath: state.refBasePath ?? state.basePath,
  });
  validateStaticConfigFile(resolvedRefPath, state, true);
}

function validateCodeReference(
  value: unknown,
  label: string,
  state: ProviderValidationState,
): void {
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== 'string' ||
    !renderEnvOnlyInObject(value, state.env).startsWith(FILE_PROVIDER_PREFIX)
  ) {
    throw new ConfigurationError(
      `Inline ${label} is not allowed through MCP tools; use a workspace file`,
    );
  }
  validateConfigFileReference(value, state);
}

function validateFileReferencesInValue(value: unknown, state: ProviderValidationState): void {
  if (typeof value === 'string') {
    const rendered = renderEnvOnlyInObject(value, state.env);
    if (rendered.startsWith(FILE_PROVIDER_PREFIX)) {
      validateConfigFileReference(rendered, state);
    } else if (LOCAL_PROVIDER_PREFIXES.some((prefix) => rendered.startsWith(prefix))) {
      validateProviderIdWithState(rendered, state);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => validateFileReferencesInValue(entry, state));
    return;
  }

  const object = getObject(value);
  if (object) {
    if (typeof object.type === 'string') {
      validateCodeReference(object.transform, 'assertion transform', state);
    }
    if (
      typeof object.type === 'string' &&
      ['javascript', 'python', 'ruby'].includes(object.type.replace(/^not-/, ''))
    ) {
      validateCodeReference(object.value, `${object.type} assertion`, state);
    }
    if (object.provider !== undefined) {
      validateProviderReferenceWithState(object.provider, state);
    }
    validateCodeReference(getObject(object.options)?.transform, 'test transform', state);
    if (object.type === 'file' && typeof object.path === 'string') {
      validateConfigFileReference(object.path, state);
    }
    for (const [key, entry] of Object.entries(object)) {
      if (key === '$ref') {
        validateJsonSchemaRef(entry, state);
      }
      validateFileReferencesInValue(entry, state);
    }
  }
}

function validateLocalConfigFileReferences(
  value: unknown,
  state: ProviderValidationState,
  recurseObjectValues = false,
  inspectContents = false,
): void {
  if (typeof value === 'string') {
    const renderedValue = renderEnvOnlyInObject(value, state.env);
    if (isLocalConfigFileReference(renderedValue)) {
      if (renderedValue.startsWith('exec:')) {
        validateExecReference(renderedValue, state, true);
      } else {
        validateConfigFileReference(renderedValue, state);
      }
      if (inspectContents) {
        const filePath = stripConfigFileExport(
          renderedValue.startsWith(FILE_PROVIDER_PREFIX)
            ? renderedValue.slice(FILE_PROVIDER_PREFIX.length)
            : renderedValue,
        );
        for (const match of globSync(filePath, {
          absolute: true,
          cwd: state.basePath,
          nodir: true,
        })) {
          validateStaticConfigFile(match, state);
        }
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) =>
      validateLocalConfigFileReferences(entry, state, recurseObjectValues, inspectContents),
    );
    return;
  }

  const object = getObject(value);
  if (object) {
    if (recurseObjectValues) {
      for (const key of Object.keys(object)) {
        validateLocalConfigFileReferences(key, state);
      }
    }
    for (const reference of [object.path, object.file].filter(
      (entry): entry is string => typeof entry === 'string',
    )) {
      validateLocalConfigFileReferences(reference, state);
    }
    if (inspectContents && typeof object.raw === 'string') {
      validateLocalConfigFileReferences(object.raw, state, false, true);
    }
    if (recurseObjectValues) {
      Object.values(object).forEach((entry) =>
        validateLocalConfigFileReferences(entry, state, recurseObjectValues, inspectContents),
      );
    }
  }
}

function validateStaticConfigLocalReferences(
  rootConfig: Record<string, unknown>,
  state: ProviderValidationState,
): void {
  validateLocalConfigFileReferences(rootConfig.prompts, state, false, true);
  const promptMap = getObject(rootConfig.prompts);
  if (promptMap) {
    Object.keys(promptMap).forEach((promptPath) =>
      validateLocalConfigFileReferences(promptPath, state),
    );
  }
  validateLocalConfigFileReferences(rootConfig.tests, state, false, true);
  validateLocalConfigFileReferences(rootConfig.defaultTest, state, false, true);
  validateLocalConfigFileReferences(rootConfig.outputPath, state);
  for (const envPath of [getObject(rootConfig.commandLineOptions)?.envPath].flat()) {
    if (typeof envPath === 'string') {
      validateConfigFileReference(envPath, state);
    }
  }
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
  validateCodeReference(descriptor.loadOptions.transform, 'provider transform', providerState);
  for (const key of [
    'transformRequest',
    'transformResponse',
    'responseParser',
    'validateStatus',
    'sessionParser',
  ]) {
    validateCodeReference(configObject?.[key], key, providerState);
  }
  validateCodeReference(
    getObject(configObject?.session)?.responseParser,
    'session responseParser',
    providerState,
  );
  if (renderedProviderId === 'browser' || renderedProviderId.startsWith('browser:')) {
    for (const action of Array.isArray(configObject?.actions) ? configObject.actions : []) {
      const entry = getObject(action);
      const screenshotPath = getObject(entry?.args)?.path;
      if (entry?.action === 'screenshot' && typeof screenshotPath === 'string') {
        validateConfigFileReference(screenshotPath, providerState);
      }
    }
  }
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
  const cacheKey = JSON.stringify([realProviderPath, state.env]);
  if (state.validatedConfigFiles.has(cacheKey)) {
    return;
  }
  state.validatedConfigFiles.add(cacheKey);

  const rawConfig = loadYaml(fs.readFileSync(realProviderPath, 'utf8'));
  const configs = Array.isArray(rawConfig) ? rawConfig : [rawConfig];
  for (const config of configs) {
    validateProviderReferenceWithState(config, state, true);
  }
}

function isInlineExecutionFlag(part: string): boolean {
  return (
    INLINE_EXECUTION_FLAGS.has(part.split('=', 1)[0].toLowerCase()) ||
    /^-[a-z]*[cemp][a-z]*$/i.test(part)
  );
}

function validateExecReference(
  value: string,
  state: ProviderValidationState,
  configPrompt: boolean,
): void {
  const parts = parseScriptParts(value.slice('exec:'.length));
  const looksLikePath = (part: string) =>
    path.isAbsolute(part) ||
    part.includes('/') ||
    part.includes('\\') ||
    (configPrompt ? hasConfigFileExtension(part) : hasProviderFileExtension(part));
  const validatePath = (part: string) =>
    configPrompt
      ? validateConfigFileReference(part, state)
      : validateMcpFilePath(stripProviderFileExport(part), state.basePath);

  let hasScript = false;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!hasScript && isInlineExecutionFlag(part)) {
      throw new ConfigurationError(
        'MCP exec commands must use a workspace script, not inline code',
      );
    }
    const separator = part.indexOf('=');
    const option = (separator === -1 ? part : part.slice(0, separator)).toLowerCase();
    const optionValue = separator === -1 ? undefined : part.slice(separator + 1);
    const preload =
      part.match(/^-r(.+)$/i)?.[1] ??
      (PRELOAD_EXECUTION_FLAGS.has(option) ? (optionValue ?? parts[++index]) : undefined);
    if (preload || PRELOAD_EXECUTION_FLAGS.has(option)) {
      if (!preload || !isLocalConfigFileReference(preload)) {
        throw new ConfigurationError('MCP exec preloads require a workspace file');
      }
      validatePath(preload);
      continue;
    }
    if (optionValue && looksLikePath(optionValue)) {
      validatePath(optionValue);
    }
    if (looksLikePath(part)) {
      validatePath(part);
      const scriptPath = path.resolve(state.basePath, stripProviderFileExport(part));
      hasScript ||= fs.existsSync(scriptPath) && fs.statSync(scriptPath).isFile();
    }
  }
  if (!parts.length || !hasScript) {
    throw new ConfigurationError('MCP exec commands require a workspace script file');
  }
}

function validateStaticConfigContents(value: unknown, state: ProviderValidationState): void {
  validateFileReferencesInValue(value, state);

  if (Array.isArray(value)) {
    value.forEach((entry) => validateProviderReferenceWithState(entry, state));
    return;
  }

  const rootConfig = getObject(value);
  if (!rootConfig) {
    return;
  }

  validateStaticConfigLocalReferences(rootConfig, state);
  validateProviderReferenceWithState(rootConfig, state);

  const providers = rootConfig.providers ?? rootConfig.targets;
  if (Array.isArray(providers)) {
    providers.forEach((provider) => validateProviderReferenceWithState(provider, state));
  } else if (providers !== undefined) {
    validateProviderReferenceWithState(providers, state);
  }
}

function validateStaticConfigFile(
  configPath: string,
  state: ProviderValidationState,
  preserveBasePath = false,
): void {
  const extension = path.extname(configPath).toLowerCase();
  if (!STATIC_CONFIG_EXTENSIONS.has(extension) || !fs.existsSync(configPath)) {
    return;
  }

  const realConfigPath = fs.realpathSync(configPath);
  const rawConfig = loadYaml(fs.readFileSync(realConfigPath, 'utf8'));
  const configState = {
    ...state,
    basePath: preserveBasePath ? state.basePath : path.dirname(realConfigPath),
    refBasePath: path.dirname(realConfigPath),
    env: mergeProviderEnv(getObject(rawConfig)?.env, state.env),
  };
  const cacheKey = JSON.stringify([realConfigPath, configState.basePath, configState.env]);
  if (state.validatedConfigFiles.has(cacheKey)) {
    return;
  }
  state.validatedConfigFiles.add(cacheKey);

  validateStaticConfigContents(rawConfig, configState);
}

function validateProviderIdWithState(providerId: string, state: ProviderValidationState): void {
  if (!providerId || /[\0\r\n]/.test(providerId)) {
    throw new ConfigurationError('Invalid provider ID format: provider ID cannot be empty');
  }

  const renderedProviderId = renderProviderIdForValidation(providerId, state.env);
  if (renderedProviderId.startsWith('promptfoo://')) {
    throw new ConfigurationError(
      'Cloud provider references cannot be validated through MCP tools; use a local provider config',
    );
  }
  if (renderedProviderId.startsWith('exec:')) {
    validateExecReference(renderedProviderId, state, false);
    return;
  }
  if (/\s/.test(renderedProviderId) || renderedProviderId.endsWith(':')) {
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

  if (renderedProviderId.startsWith('package:')) {
    const packageName = renderedProviderId.slice('package:'.length).split(':', 1)[0];
    if (
      !packageName ||
      path.isAbsolute(packageName) ||
      /^[A-Za-z]:[\\/]/.test(packageName) ||
      packageName.startsWith('.') ||
      packageName.split('/').includes('..') ||
      packageName.includes('\\')
    ) {
      throw new ConfigurationError('MCP package providers must use a package name', providerId);
    }
    return;
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
  if (renderedProviderId.includes('..') || renderedProviderId.includes('~')) {
    throw new ConfigurationError('Invalid provider ID format: unexpected traversal', providerId);
  }
}

export function validateMcpAssertion(assertion: unknown): void {
  validateFileReferencesInValue(assertion, {
    basePath: process.cwd(),
    validatedConfigFiles: new Set(),
  });
}

export function validateMcpProviderPrompt(
  provider: { id: string | (() => string) },
  prompt: string,
): void {
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
  if (providerId.startsWith('openai:transcription:')) {
    validateMcpFilePath(prompt.trim());
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
export function validateMcpConfigFile(configPath: string, workspacePath = process.cwd()): void {
  validateMcpFilePathWithinWorkspace(configPath, workspacePath, workspacePath);

  const matchedConfigPaths = globSync(configPath, {
    absolute: true,
    cwd: workspacePath,
    nodir: true,
    windowsPathsNoEscape: true,
  });
  if (matchedConfigPaths.length === 0) {
    return;
  }

  const state: ProviderValidationState = {
    basePath: workspacePath,
    validatedConfigFiles: new Set(),
  };

  for (const matchedConfigPath of matchedConfigPaths) {
    validateMcpFilePathWithinWorkspace(matchedConfigPath, workspacePath, workspacePath);
    const extension = path.extname(matchedConfigPath).toLowerCase();
    if (!STATIC_CONFIG_EXTENSIONS.has(extension)) {
      throw new ConfigurationError(
        'Dynamic JavaScript and TypeScript config files are not allowed through MCP tools; use YAML or JSON instead',
        matchedConfigPath,
      );
    }

    const rawConfig = loadYaml(fs.readFileSync(matchedConfigPath, 'utf8'));
    const rootConfig = getObject(rawConfig);
    const configState: ProviderValidationState = {
      ...state,
      basePath: path.dirname(matchedConfigPath),
      env: asEnvOverrides(rootConfig?.env),
    };
    validateStaticConfigFile(matchedConfigPath, configState);
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
