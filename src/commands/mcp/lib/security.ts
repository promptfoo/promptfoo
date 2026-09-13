import * as fs from 'fs';
import * as path from 'path';

import { parse as parseCsv } from 'csv-parse/sync';
import { globSync } from 'glob';
import { testCaseFromCsvRow } from '../../../csv';
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
const STATIC_CONFIG_EXTENSIONS = new Set(['.csv', '.json', '.jsonl', '.yaml', '.yml']);
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
const SCRIPT_RUNTIME_NAMES = new Set(['bash', 'node', 'nodejs', 'python', 'python3', 'ruby', 'sh']);
const SCRIPT_FILE_EXTENSIONS = new Set([
  'bash',
  'bat',
  'cjs',
  'cmd',
  'cts',
  'js',
  'mjs',
  'mts',
  'pl',
  'ps1',
  'py',
  'rb',
  'sh',
  'ts',
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

function validateStateFilePath(filePath: string, state: ProviderValidationState): void {
  validateMcpFilePathWithinWorkspace(
    filePath,
    state.workspacePath ?? state.basePath,
    state.basePath,
  );
}

function validateStateExecutablePath(filePath: string, state: ProviderValidationState): void {
  validateStateFilePath(filePath, state);
  const resolvedPath = path.resolve(state.basePath, filePath);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new ConfigurationError('MCP executable overrides require a workspace file', filePath);
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
    filePath.includes('/') ||
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
  workspacePath?: string;
  configPath?: string;
  refBasePath?: string;
  rootConfig?: unknown;
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
    validateStateFilePath(candidate, state);
  }
}

function resolveConfigFileReference(value: string, state: ProviderValidationState): string {
  const rendered = renderConfigFileReferenceForValidation(value, state);
  const withoutProtocol = rendered.startsWith(FILE_PROVIDER_PREFIX)
    ? rendered.slice(FILE_PROVIDER_PREFIX.length)
    : rendered;
  const filePath = stripConfigFileExport(withoutProtocol);
  validateStateFilePath(filePath, state);
  return path.resolve(state.basePath, filePath);
}

function validateJsonSchemaRef(
  value: unknown,
  state: ProviderValidationState,
  assertionContext = false,
  providerConfigContext = false,
): void {
  if (typeof value !== 'string') {
    return;
  }

  const renderedRef = renderConfigFileReferenceForValidation(value, state);
  if (!renderedRef) {
    return;
  }

  if (renderedRef.startsWith('#')) {
    const cacheKey = JSON.stringify([
      state.configPath,
      renderedRef,
      assertionContext,
      providerConfigContext,
      state.env,
    ]);
    if (state.validatedConfigFiles.has(cacheKey)) {
      return;
    }
    state.validatedConfigFiles.add(cacheKey);
    const target = resolveJsonPointer(state.rootConfig, renderedRef);
    if (target !== undefined) {
      if (providerConfigContext) {
        validateProviderConfigCodeReferences(target, state);
        validateMultipartPaths(getObject(target), state);
        validateProviderReferenceWithState(target, state);
      } else {
        validateFileReferencesInValue(target, state, assertionContext);
      }
    }
    return;
  }

  const [refPath, fragment] = renderedRef.split('#', 2);
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
  validateStaticConfigFile(resolvedRefPath, state, true, assertionContext, providerConfigContext);
  if (providerConfigContext) {
    const rawRef = loadYaml(fs.readFileSync(resolvedRefPath, 'utf8'));
    const refState = { ...state, basePath: path.dirname(resolvedRefPath) };
    const target = fragment === undefined ? rawRef : resolveJsonPointer(rawRef, `#${fragment}`);
    validateProviderConfigCodeReferences(target, refState);
    validateProviderReferenceWithState(target, refState);
  }
}

function resolveJsonPointer(root: unknown, reference: string): unknown {
  let pointer: string;
  try {
    pointer = decodeURIComponent(reference.slice(1));
  } catch {
    throw new ConfigurationError('Invalid JSON-schema reference', reference);
  }
  const parts = pointer === '' ? [] : pointer.startsWith('/') ? pointer.slice(1).split('/') : [];
  return parts.reduce<unknown>((current, part) => {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    return Array.isArray(current) ? current[Number(key)] : getObject(current)?.[key];
  }, root);
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

function validateFileReferencesInValue(
  value: unknown,
  state: ProviderValidationState,
  assertionContext = false,
  providerConfigContext = false,
): void {
  if (typeof value === 'string') {
    const rendered = renderEnvOnlyInObject(value, state.env);
    if (rendered.startsWith(FILE_PROVIDER_PREFIX)) {
      validateConfigFileReference(rendered, state);
      if (assertionContext) {
        validateStaticConfigFile(resolveConfigFileReference(rendered, state), state, false, true);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) =>
      validateFileReferencesInValue(entry, state, assertionContext, providerConfigContext),
    );
    return;
  }

  const object = getObject(value);
  if (object) {
    if (assertionContext && typeof object.type === 'string') {
      validateCodeReference(object.transform, 'assertion transform', state);
      validateCodeReference(object.contextTransform, 'assertion contextTransform', state);
    }
    if (
      assertionContext &&
      typeof object.type === 'string' &&
      ['javascript', 'python', 'ruby'].includes(object.type.replace(/^not-/, ''))
    ) {
      validateCodeReference(object.value, `${object.type} assertion`, state);
    }
    if (object.provider !== undefined) {
      validateProviderReferenceWithState(object.provider, state);
    }
    const options = getObject(object.options);
    for (const key of ['transform', 'transformVars', 'postprocess']) {
      validateCodeReference(options?.[key], `test ${key}`, state);
    }
    if (object.type === 'file' && typeof object.path === 'string') {
      validateConfigFileReference(object.path, state);
    }
    for (const [key, entry] of Object.entries(object)) {
      if (key === 'vars') {
        validateLocalConfigFileReferences(entry, state, true, true);
      }
      if (key === '$ref') {
        validateJsonSchemaRef(entry, state, assertionContext, providerConfigContext);
      }
      validateFileReferencesInValue(
        entry,
        state,
        assertionContext || key === 'assert' || key === 'assertions',
        providerConfigContext || key === 'config',
      );
    }
  }
}

function rejectRemoteConfigSources(value: unknown): void {
  if (typeof value === 'string') {
    if (REMOTE_CONFIG_REFERENCE_PATTERN.test(value.trim())) {
      throw new ConfigurationError('Remote test sources are not allowed through MCP tools', value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(rejectRemoteConfigSources);
    return;
  }
  const object = getObject(value);
  if (object) {
    for (const key of ['path', 'file', 'tests', 'scenarios']) {
      rejectRemoteConfigSources(object[key]);
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
          if (/\.xlsx?$/i.test(match)) {
            throw new ConfigurationError(
              'Spreadsheet test files are not allowed through MCP tools; use CSV, YAML, or JSON instead',
              match,
            );
          }
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
  rejectRemoteConfigSources(rootConfig.tests);
  rejectRemoteConfigSources(rootConfig.scenarios);
  validateLocalConfigFileReferences(rootConfig.prompts, state, false, true);
  const promptMap = getObject(rootConfig.prompts);
  if (promptMap) {
    Object.keys(promptMap).forEach((promptPath) =>
      validateLocalConfigFileReferences(promptPath, state),
    );
  }
  validateLocalConfigFileReferences(rootConfig.tests, state, false, true);
  validateLocalConfigFileReferences(rootConfig.defaultTest, state, false, true);
  validateLocalConfigFileReferences(rootConfig.scenarios, state, false, true);
  validateLocalConfigFileReferences(rootConfig.outputPath, state);
  for (const envPath of [getObject(rootConfig.commandLineOptions)?.envPath].flat()) {
    if (typeof envPath === 'string') {
      validateConfigFileReference(envPath, state);
    }
  }
  for (const extension of [rootConfig.extensions].flat()) {
    if (extension != null) {
      validateCodeReference(extension, 'extension', state);
    }
  }
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
  if (serverConfig.env !== undefined) {
    throw new ConfigurationError('MCP server env configs are not allowed through MCP tools');
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

function validateProviderConfigCodeReferences(
  config: unknown,
  state: ProviderValidationState,
): void {
  const configObject = getObject(config);
  for (const key of [
    'transform',
    'transformRequest',
    'transformResponse',
    'responseParser',
    'validateStatus',
    'sessionParser',
    'streamResponse',
  ]) {
    validateCodeReference(configObject?.[key], key, state);
  }
}

function validateMultipartPaths(
  config: Record<string, unknown> | undefined,
  state: ProviderValidationState,
): void {
  const multipart = getObject(config?.multipart);
  for (const part of Array.isArray(multipart?.parts) ? multipart.parts : []) {
    const source = getObject(getObject(part)?.source);
    if (source?.type === 'path' && typeof source.path === 'string') {
      validateConfigFileReference(source.path, state);
    }
  }
}

function validateProviderConfigPaths(
  providerId: string,
  config: Record<string, unknown> | undefined,
  state: ProviderValidationState,
): void {
  for (const key of ['codex_path_override', 'interpreter_path', 'path_to_claude_code_executable']) {
    if (typeof config?.[key] === 'string') {
      validateStateExecutablePath(config[key], state);
    }
  }
  if (providerId.startsWith('google:live:')) {
    const statefulApi = getObject(config?.functionToolStatefulApi);
    for (const key of ['file', 'pythonExecutable']) {
      if (typeof statefulApi?.[key] === 'string') {
        validateStateExecutablePath(statefulApi[key], state);
      }
    }
  }
  for (const key of ['audioFile', 'audioOutputPath']) {
    if (typeof config?.[key] === 'string') {
      validateStateFilePath(config[key], state);
    }
  }
  if (providerId !== 'openai:codex-security' && !providerId.startsWith('openai:codex-security:')) {
    return;
  }
  for (const key of [
    'repository',
    'working_dir',
    'output_dir',
    'plugin_path',
    'python_path',
    'finding_file',
  ]) {
    if (typeof config?.[key] === 'string') {
      validateStateFilePath(config[key], state);
    }
  }
  for (const filePath of Array.isArray(config?.knowledge_base_paths)
    ? config.knowledge_base_paths
    : []) {
    if (typeof filePath === 'string') {
      validateStateFilePath(filePath, state);
    }
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
  validateProviderConfigPaths(renderedProviderId, configObject, providerState);
  validateCodeReference(descriptor.loadOptions.transform, 'provider transform', providerState);
  validateProviderConfigCodeReferences(configObject, providerState);
  for (const container of [
    getObject(configObject?.tls),
    getObject(configObject?.auth),
    getObject(configObject?.signatureAuth),
  ]) {
    for (const key of [
      'caPath',
      'certPath',
      'keyPath',
      'pfxPath',
      'privateKeyPath',
      'keystorePath',
    ]) {
      if (typeof container?.[key] === 'string') {
        validateConfigFileReference(container[key], providerState);
      }
    }
  }
  const functionToolCallbacks = getObject(configObject?.functionToolCallbacks);
  if (functionToolCallbacks) {
    Object.values(functionToolCallbacks).forEach((callback) =>
      validateCodeReference(callback, 'function tool callback', providerState),
    );
  }
  validateCodeReference(
    getObject(configObject?.session)?.responseParser,
    'session responseParser',
    providerState,
  );
  validateMultipartPaths(configObject, providerState);
  if (renderedProviderId === 'browser' || renderedProviderId.startsWith('browser:')) {
    for (const action of [configObject?.actions, configObject?.steps].flat()) {
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
  const isScriptPath = (part: string) =>
    SCRIPT_FILE_EXTENSIONS.has(path.extname(stripProviderFileExport(part)).slice(1).toLowerCase());
  const command = parts[0];
  const usesScriptRuntime =
    command !== undefined && SCRIPT_RUNTIME_NAMES.has(path.basename(command).toLowerCase());

  let hasScript = false;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (isInlineExecutionFlag(part)) {
      throw new ConfigurationError(
        'MCP exec commands must use a workspace script, not inline code',
      );
    }
    const separator = part.indexOf('=');
    const option = (separator === -1 ? part : part.slice(0, separator)).toLowerCase();
    const optionValue = separator === -1 ? undefined : part.slice(separator + 1);
    if (separator !== -1 && !option.startsWith('-')) {
      throw new ConfigurationError('MCP exec environment overrides are not allowed');
    }
    if (option === 'node_options') {
      throw new ConfigurationError('MCP exec runtime options are not allowed');
    }
    const preload =
      part.match(/^-r(.+)$/i)?.[1] ??
      (PRELOAD_EXECUTION_FLAGS.has(option) ? (optionValue ?? parts[++index]) : undefined);
    if (preload || PRELOAD_EXECUTION_FLAGS.has(option)) {
      if (!preload || !isLocalConfigFileReference(preload)) {
        throw new ConfigurationError('MCP exec preloads require a workspace file');
      }
      validatePath(
        preload.startsWith(FILE_PROVIDER_PREFIX)
          ? preload.slice(FILE_PROVIDER_PREFIX.length)
          : preload,
      );
      continue;
    }
    if (!hasScript && index > 0 && !part.startsWith('-') && !looksLikePath(part)) {
      throw new ConfigurationError('MCP exec commands require the workspace script first');
    }
    if (optionValue && looksLikePath(optionValue)) {
      validatePath(optionValue);
    }
    if (looksLikePath(part)) {
      validatePath(part);
      const scriptPath = path.resolve(state.basePath, stripProviderFileExport(part));
      hasScript ||=
        (index === 0 || usesScriptRuntime) &&
        isScriptPath(part) &&
        fs.existsSync(scriptPath) &&
        fs.statSync(scriptPath).isFile();
    }
  }
  if (!parts.length || !hasScript) {
    throw new ConfigurationError('MCP exec commands require a workspace script file');
  }
}

function validateStaticConfigContents(
  value: unknown,
  state: ProviderValidationState,
  assertionContext = false,
  providerConfigContext = false,
): void {
  validateFileReferencesInValue(value, state, assertionContext, providerConfigContext);

  if (Array.isArray(value)) {
    return;
  }

  const rootConfig = getObject(value);
  if (!rootConfig) {
    return;
  }

  validateStaticConfigLocalReferences(rootConfig, state);
  if ('id' in rootConfig) {
    validateProviderReferenceWithState(rootConfig, state);
  }

  const providers = rootConfig.providers ?? rootConfig.targets;
  const validateProvider = (provider: unknown) => {
    const reference = getObject(provider)?.$ref;
    if (reference === undefined) {
      validateProviderReferenceWithState(provider, state);
    } else {
      validateJsonSchemaRef(reference, state, false, true);
    }
  };
  if (Array.isArray(providers)) {
    providers.forEach(validateProvider);
  } else if (providers !== undefined) {
    validateProvider(providers);
  }
}

function validateStaticConfigFile(
  configPath: string,
  state: ProviderValidationState,
  preserveBasePath = false,
  assertionContext = false,
  providerConfigContext = false,
): void {
  const extension = path.extname(configPath).toLowerCase();
  if (!STATIC_CONFIG_EXTENSIONS.has(extension) || !fs.existsSync(configPath)) {
    return;
  }

  const realConfigPath = fs.realpathSync(configPath);
  const contents = fs.readFileSync(realConfigPath, 'utf8');
  const rawConfig =
    extension === '.csv'
      ? parseCsv(contents, { columns: true, skip_empty_lines: true }).map((row) =>
          testCaseFromCsvRow(row as Parameters<typeof testCaseFromCsvRow>[0]),
        )
      : extension === '.jsonl'
        ? contents
            .split(/\r?\n/)
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line))
        : loadYaml(contents);
  const configState = {
    ...state,
    basePath: preserveBasePath ? state.basePath : path.dirname(realConfigPath),
    refBasePath: path.dirname(realConfigPath),
    env: mergeProviderEnv(getObject(rawConfig)?.env, state.env),
    configPath: realConfigPath,
    rootConfig: rawConfig,
  };
  const cacheKey = JSON.stringify([
    realConfigPath,
    configState.basePath,
    configState.env,
    assertionContext,
    providerConfigContext,
  ]);
  if (state.validatedConfigFiles.has(cacheKey)) {
    return;
  }
  state.validatedConfigFiles.add(cacheKey);

  validateStaticConfigContents(rawConfig, configState, assertionContext, providerConfigContext);
}

function validateProviderIdWithState(providerId: string, state: ProviderValidationState): void {
  if (!providerId) {
    throw new ConfigurationError('Invalid provider ID format: provider ID cannot be empty');
  }
  if (/[\0\r\n]/.test(providerId)) {
    throw new ConfigurationError(
      'Invalid provider ID format: provider ID contains control characters',
    );
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
    validateStateFilePath(providerPath, state);
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
  validateFileReferencesInValue(
    assertion,
    {
      basePath: process.cwd(),
      validatedConfigFiles: new Set(),
    },
    true,
  );
}

export function validateMcpProviderPrompt(
  provider: { id: string | (() => string) },
  prompt: string,
  requestedProviderId?: string,
): void {
  const providerId =
    requestedProviderId ?? (typeof provider.id === 'function' ? provider.id() : provider.id);
  if (
    providerId.startsWith('openai:transcription:') ||
    providerId.startsWith('elevenlabs:stt:') ||
    providerId === 'elevenlabs:isolation'
  ) {
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
    const resolvedConfigPath = path.resolve(workspacePath, configPath);
    if (fs.existsSync(resolvedConfigPath) && fs.statSync(resolvedConfigPath).isDirectory()) {
      throw new ConfigurationError('MCP config paths must name a static config file', configPath);
    }
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
      workspacePath,
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
