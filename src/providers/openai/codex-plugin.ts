import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { z } from 'zod';
import logger from '../../logger';
import { providerRegistry } from '../providerRegistry';
import { type OpenAICodexSDKConfig, OpenAICodexSDKProvider } from './codex-sdk';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

const CODEX_PLUGIN_MARKETPLACE = 'promptfoo-eval';
const CODEX_PLUGIN_ARTIFACT_DIR_ENV = 'PROMPTFOO_CODEX_PLUGIN_ARTIFACT_DIR';
const CODEX_PLUGIN_RUNTIME_PREFIX = 'promptfoo-codex-plugin-';
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[^/@\s]+\/)?[^/@\s]+$/;
const NPM_PACKAGE_VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/;

const PluginSourceSchema = z
  .object({
    package: z.string().min(1).regex(NPM_PACKAGE_NAME_PATTERN).optional(),
    path: z.string().min(1).optional(),
    version: z.string().min(1).regex(NPM_PACKAGE_VERSION_PATTERN).optional(),
  })
  .strict()
  .superRefine((source, context) => {
    if (Boolean(source.package) === Boolean(source.path)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'set exactly one of plugin.package or plugin.path',
      });
    }
    if (source.path && source.version) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'plugin.version is only valid with plugin.package',
      });
    }
  });

const OpenAICodexPluginConfigSchema = z
  .object({
    plugin: PluginSourceSchema,
    invocation: z.string().min(1).optional(),
    skill: z.string().min(1).optional(),
    workspace: z.string().min(1).optional(),
    timeout_ms: z.number().int().positive().optional(),
    artifacts_dir: z.string().min(1).optional(),
    retain_runtime: z.boolean().optional(),
    copy_auth: z.boolean().optional(),
    codex_home: z.string().min(1).optional(),
  })
  .passthrough()
  .superRefine((config, context) => {
    if (config.invocation && config.skill) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'set only one of invocation or skill',
      });
    }
  });

export interface CodexPluginSource {
  package?: string;
  path?: string;
  version?: string;
}

export interface OpenAICodexPluginConfig extends OpenAICodexSDKConfig {
  plugin: CodexPluginSource;
  invocation?: string;
  skill?: string;
  workspace?: string;
  timeout_ms?: number;
  artifacts_dir?: string;
  retain_runtime?: boolean;
  copy_auth?: boolean;
  codex_home?: string;
}

interface PluginManifest {
  name: string;
  version?: string;
}

interface CodexPluginRuntime {
  root: string;
  home: string;
  codexHome: string;
  tmpDir: string;
  artifactDir: string;
  exportedArtifactDir?: string;
  workspace: string;
  pluginName: string;
  pluginVersion: string;
  pluginSource: 'package' | 'path';
  pluginSourceIdentity: string;
  pluginSourceDigest?: string;
  pluginGitCommit?: string;
}

interface CodexPluginArtifactReference {
  path: string;
  relativePath: string;
  owner: 'provider-runtime' | 'caller-export';
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${pathLabel}: ${issue.message}`;
    })
    .join('; ');
}

function parseCodexPluginConfig(
  config: OpenAICodexPluginConfig | undefined,
): OpenAICodexPluginConfig {
  try {
    return OpenAICodexPluginConfigSchema.parse(config ?? {}) as OpenAICodexPluginConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid OpenAI Codex plugin config: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

function pathExists(pathToCheck: string): boolean {
  return fs.existsSync(pathToCheck);
}

function resolveExistingDirectory(inputPath: string, label: string): string {
  const resolvedPath = fs.realpathSync(path.resolve(inputPath));
  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`${label} must be a directory: ${resolvedPath}`);
  }
  return resolvedPath;
}

function abortError(message = 'OpenAI Codex plugin call aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

async function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function assertTreeHasNoSymlinks(root: string, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  for (const entry of await withAbort(fs.promises.readdir(root, { withFileTypes: true }), signal)) {
    throwIfAborted(signal);
    const entryPath = path.join(root, entry.name);
    const entryStat = await withAbort(fs.promises.lstat(entryPath), signal);
    if (entryStat.isSymbolicLink()) {
      throw new Error(`Codex plugin trees may not contain symlinks: ${entryPath}`);
    }
    if (entryStat.isDirectory()) {
      await assertTreeHasNoSymlinks(entryPath, signal);
    }
  }
}

async function copyTree(source: string, destination: string, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await withAbort(fs.promises.mkdir(destination, { recursive: false }), signal);
  for (const entry of await withAbort(
    fs.promises.readdir(source, { withFileTypes: true }),
    signal,
  )) {
    throwIfAborted(signal);
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    const stat = await withAbort(fs.promises.lstat(sourcePath), signal);
    if (stat.isSymbolicLink()) {
      throw new Error(`Codex plugin trees may not contain symlinks: ${sourcePath}`);
    }
    if (stat.isDirectory()) {
      await copyTree(sourcePath, destinationPath, signal);
    } else if (stat.isFile()) {
      await withAbort(
        fs.promises.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL),
        signal,
      );
    }
  }
}

function readPluginManifest(pluginRoot: string): PluginManifest {
  const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  if (!pathExists(manifestPath)) {
    throw new Error(`Codex plugin manifest not found: ${manifestPath}`);
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse Codex plugin manifest ${manifestPath}: ${String(error)}`);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Codex plugin manifest must be an object: ${manifestPath}`);
  }

  const pluginName = 'name' in manifest ? manifest.name : undefined;
  if (typeof pluginName !== 'string' || pluginName.trim().length === 0) {
    throw new Error(`Codex plugin manifest must define a non-empty name: ${manifestPath}`);
  }

  const pluginVersion = 'version' in manifest ? manifest.version : undefined;
  return {
    name: pluginName,
    ...(typeof pluginVersion === 'string' && pluginVersion.trim().length > 0
      ? { version: pluginVersion }
      : {}),
  };
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'local';
}

function npmPackageSpec(source: CodexPluginSource): string {
  if (!source.package) {
    throw new Error('Codex plugin package source is missing plugin.package');
  }
  return source.version ? `${source.package}@${source.version}` : source.package;
}

function checkTarEntry(entry: string): void {
  if (
    entry.length === 0 ||
    path.isAbsolute(entry) ||
    entry.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`Codex plugin package archive contains an unsafe path: ${entry}`);
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) => reject(error.name === 'AbortError' ? abortError() : error));
    child.once('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(`${command} failed while resolving a Codex plugin source: ${stderr.trim()}`),
        );
      }
    });
  });
}

async function unpackPluginPackage(
  source: CodexPluginSource,
  runtimeRoot: string,
  signal: AbortSignal,
): Promise<string> {
  const packageDir = path.join(runtimeRoot, 'package');
  fs.mkdirSync(packageDir, { recursive: true });
  const packageSpec = npmPackageSpec(source);
  const packOutput = await runCommand(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packageDir, '--', packageSpec],
    runtimeRoot,
    signal,
  );
  const packResult = z
    .array(z.object({ filename: z.string().min(1) }))
    .min(1)
    .parse(JSON.parse(packOutput));
  const archivePath = path.join(packageDir, packResult[0].filename);
  const archiveEntries = (await runCommand('tar', ['-tzf', archivePath], runtimeRoot, signal))
    .split('\n')
    .filter(Boolean);
  for (const entry of archiveEntries) {
    checkTarEntry(entry);
  }

  // Package sources are trusted executable inputs, but archive link entries are still
  // rejected before extraction so trusted-source evaluation cannot escape its runtime.
  const verboseArchiveEntries = await runCommand(
    'tar',
    ['-tvzf', archivePath],
    runtimeRoot,
    signal,
  );
  for (const entry of verboseArchiveEntries.split('\n').filter(Boolean)) {
    if (/^[lh]/.test(entry)) {
      throw new Error('Codex plugin package archive may not contain link entries');
    }
  }

  const extractedRoot = path.join(packageDir, 'extracted');
  fs.mkdirSync(extractedRoot, { recursive: true });
  await runCommand('tar', ['-xzf', archivePath, '-C', extractedRoot], runtimeRoot, signal);
  return resolveExistingDirectory(path.join(extractedRoot, 'package'), 'Codex plugin package root');
}

async function resolvePluginRoot(
  source: CodexPluginSource,
  runtimeRoot: string,
  signal: AbortSignal,
): Promise<{
  root: string;
  sourceIdentity: string;
  sourceType: CodexPluginRuntime['pluginSource'];
}> {
  if (source.path) {
    const root = resolveExistingDirectory(source.path, 'Codex plugin path');
    return { root, sourceIdentity: `local:${path.basename(root)}`, sourceType: 'path' };
  }

  const packageSpec = npmPackageSpec(source);
  return {
    root: await unpackPluginPackage(source, runtimeRoot, signal),
    sourceIdentity: packageSpec,
    sourceType: 'package',
  };
}

async function digestTree(root: string, signal: AbortSignal): Promise<string> {
  const digest = crypto.createHash('sha256');
  const visit = async (directory: string): Promise<void> => {
    throwIfAborted(signal);
    const entries = await withAbort(
      fs.promises.readdir(directory, { withFileTypes: true }),
      signal,
    );
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      throwIfAborted(signal);
      const entryPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, entryPath).split(path.sep).join('/');
      const stat = await withAbort(fs.promises.lstat(entryPath), signal);
      digest.update(`${entry.isDirectory() ? 'd' : 'f'}:${relativePath}\0`);
      if (stat.isDirectory()) {
        await visit(entryPath);
      } else if (stat.isFile()) {
        digest.update(await withAbort(fs.promises.readFile(entryPath), signal));
      }
    }
  };
  await visit(root);
  return `sha256:${digest.digest('hex')}`;
}

async function gitCommitForPath(root: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    return (
      (await runCommand('git', ['-C', root, 'rev-parse', 'HEAD'], root, signal)).trim() || undefined
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    return undefined;
  }
}

function artifactNamespace(
  context: CallApiContextParams | undefined,
  providerId: string,
  pluginName: string,
  runtimeRoot: string,
): string {
  return [
    context?.evaluationId ?? 'manual-eval',
    providerId,
    pluginName,
    context?.testCaseId ?? `test-${context?.testIdx ?? 'manual'}`,
    `prompt-${context?.promptIdx ?? 'manual'}`,
    `repeat-${context?.repeatIndex ?? 0}`,
    path.basename(runtimeRoot),
  ]
    .map(sanitizePathSegment)
    .join(path.sep);
}

function sourceIdentity(config: OpenAICodexPluginConfig): string {
  return config.plugin.path
    ? `local:${path.basename(path.resolve(config.plugin.path))}`
    : npmPackageSpec(config.plugin);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function executionIdentity(response: ProviderResponse): {
  sessionId: string | null;
  turnId: string | null;
} {
  let turnId: string | null = null;
  try {
    const raw = typeof response.raw === 'string' ? JSON.parse(response.raw) : response.raw;
    turnId =
      typeof raw?.id === 'string' ? raw.id : typeof raw?.turn_id === 'string' ? raw.turn_id : null;
  } catch {
    turnId = null;
  }
  return { sessionId: response.sessionId ?? null, turnId };
}

function writeJson(pathToWrite: string, payload: unknown): void {
  fs.writeFileSync(pathToWrite, `${JSON.stringify(payload, null, 2)}\n`);
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function resolveArtifactExportDir(
  config: OpenAICodexPluginConfig,
  namespace: string,
): string | undefined {
  if (!config.artifacts_dir) {
    return undefined;
  }
  const artifactExportDir = path.join(path.resolve(config.artifacts_dir), namespace);
  fs.mkdirSync(artifactExportDir, { recursive: true });
  return artifactExportDir;
}

function getCodexAuthSource(config: OpenAICodexPluginConfig): string {
  return path.join(
    config.codex_home
      ? path.resolve(config.codex_home)
      : process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    'auth.json',
  );
}

function copyCodexAuthIfConfigured(config: OpenAICodexPluginConfig, codexHome: string): boolean {
  if (config.copy_auth === false) {
    return false;
  }

  const authSource = getCodexAuthSource(config);
  if (!pathExists(authSource)) {
    return false;
  }
  const resolvedAuthSource = fs.realpathSync(authSource);
  const authStat = fs.statSync(resolvedAuthSource);
  if (!authStat.isFile()) {
    throw new Error('Codex auth source must resolve to a regular file');
  }

  fs.copyFileSync(
    resolvedAuthSource,
    path.join(codexHome, 'auth.json'),
    fs.constants.COPYFILE_EXCL,
  );
  return true;
}

async function makeRuntimeRemovable(root: string): Promise<void> {
  if (!pathExists(root)) {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(entryPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      await fs.promises.chmod(entryPath, 0o700).catch(() => undefined);
      await makeRuntimeRemovable(entryPath);
    } else {
      await fs.promises.chmod(entryPath, 0o600).catch(() => undefined);
    }
  }
  await fs.promises.chmod(root, 0o700).catch(() => undefined);
}

async function removeRuntime(root: string): Promise<void> {
  try {
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EACCES') {
      throw error;
    }
    await makeRuntimeRemovable(root);
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function collectArtifactReferences(runtime: CodexPluginRuntime): CodexPluginArtifactReference[] {
  const references: CodexPluginArtifactReference[] = [];
  if (!pathExists(runtime.artifactDir)) {
    return references;
  }

  const collect = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        collect(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const entryStat = fs.lstatSync(entryPath);
      if (entryStat.nlink !== 1) {
        continue;
      }

      references.push({
        path: entryPath,
        relativePath: path.relative(runtime.artifactDir, entryPath),
        owner: 'provider-runtime',
      });
    }
  };
  collect(runtime.artifactDir);
  return references;
}

function safelyExportArtifacts(
  runtime: CodexPluginRuntime,
  retainRuntime: boolean,
): CodexPluginArtifactReference[] {
  try {
    return exportArtifacts(runtime, collectArtifactReferences(runtime), retainRuntime);
  } catch (error) {
    logger.warn('[CodexPlugin] Unable to collect or export plugin artifacts', { error });
    return [];
  }
}

function exportArtifacts(
  runtime: CodexPluginRuntime,
  references: CodexPluginArtifactReference[],
  retainRuntime: boolean,
): CodexPluginArtifactReference[] {
  if (!runtime.exportedArtifactDir) {
    return retainRuntime ? references : [];
  }

  return references.map((reference) => {
    const exportedPath = path.join(runtime.exportedArtifactDir!, reference.relativePath);
    fs.mkdirSync(path.dirname(exportedPath), { recursive: true });
    fs.copyFileSync(reference.path, exportedPath, fs.constants.COPYFILE_EXCL);
    return { path: exportedPath, relativePath: reference.relativePath, owner: 'caller-export' };
  });
}

function terminalStatus(response: ProviderResponse, timedOut: boolean, cancelled: boolean): string {
  if (cancelled) {
    return 'cancelled';
  }
  if (timedOut) {
    return 'timeout';
  }
  return response.error ? 'failed' : 'completed';
}

function withoutPluginConfig(
  config: OpenAICodexPluginConfig,
  runtime: CodexPluginRuntime,
): OpenAICodexSDKConfig {
  const {
    plugin: _plugin,
    invocation: _invocation,
    skill: _skill,
    workspace: _workspace,
    timeout_ms: _timeoutMs,
    artifacts_dir: _artifactsDir,
    retain_runtime: _retainRuntime,
    copy_auth: _copyAuth,
    codex_home: _codexHome,
    ...codexConfig
  } = config;

  return {
    ...codexConfig,
    working_dir: runtime.workspace,
    cli_env: {
      ...(codexConfig.cli_env ?? {}),
      HOME: runtime.home,
      CODEX_HOME: runtime.codexHome,
      TMPDIR: runtime.tmpDir,
      [CODEX_PLUGIN_ARTIFACT_DIR_ENV]: runtime.artifactDir,
    },
    inherit_process_env: false,
  };
}

export class OpenAICodexPluginProvider implements ApiProvider {
  config: OpenAICodexPluginConfig;
  env?: EnvOverrides;
  private providerId = 'openai:codex-plugin';
  private activeProviders = new Set<OpenAICodexSDKProvider>();

  constructor(options: { id?: string; config?: OpenAICodexPluginConfig; env?: EnvOverrides } = {}) {
    this.config = parseCodexPluginConfig(options.config);
    this.env = options.env;
    this.providerId = options.id ?? this.providerId;
    providerRegistry.register(this);
  }

  id(): string {
    return this.providerId;
  }

  requiresApiKey(): boolean {
    return false;
  }

  toString(): string {
    return '[OpenAI Codex Plugin Provider]';
  }

  async cleanup(): Promise<void> {
    await Promise.all(Array.from(this.activeProviders).map((provider) => provider.shutdown()));
    this.activeProviders.clear();
  }

  async shutdown(): Promise<void> {
    try {
      await this.cleanup();
    } finally {
      providerRegistry.unregister(this);
    }
  }

  private async createRuntime(
    config: OpenAICodexPluginConfig,
    context: CallApiContextParams | undefined,
    signal: AbortSignal,
  ): Promise<CodexPluginRuntime> {
    throwIfAborted(signal);
    const workspace = resolveExistingDirectory(
      config.workspace ?? config.working_dir ?? process.cwd(),
      'Codex plugin workspace',
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), CODEX_PLUGIN_RUNTIME_PREFIX));
    try {
      throwIfAborted(signal);
      const home = path.join(root, 'home');
      const codexHome = path.join(home, '.codex');
      const tmpDir = path.join(root, 'tmp');
      const artifactDir = path.join(root, 'artifacts');
      for (const directory of [
        home,
        codexHome,
        tmpDir,
        artifactDir,
        path.join(codexHome, '.agents', 'plugins'),
        path.join(codexHome, 'plugins', 'cache', CODEX_PLUGIN_MARKETPLACE),
      ]) {
        throwIfAborted(signal);
        await withAbort(fs.promises.mkdir(directory, { recursive: true }), signal);
      }

      const source = await resolvePluginRoot(config.plugin, root, signal);
      await assertTreeHasNoSymlinks(source.root, signal);
      const manifest = readPluginManifest(source.root);
      const pluginVersion =
        manifest.version ??
        config.plugin.version ??
        (source.sourceType === 'path' ? 'local' : 'unknown');
      const pluginSourceDigest = await digestTree(source.root, signal);
      const pluginGitCommit =
        source.sourceType === 'path' ? await gitCommitForPath(source.root, signal) : undefined;
      const installedRoot = path.join(
        codexHome,
        'plugins',
        'cache',
        CODEX_PLUGIN_MARKETPLACE,
        sanitizePathSegment(manifest.name),
        sanitizePathSegment(pluginVersion),
      );
      await withAbort(fs.promises.mkdir(path.dirname(installedRoot), { recursive: true }), signal);
      await copyTree(source.root, installedRoot, signal);

      writeJson(path.join(codexHome, '.agents', 'plugins', 'marketplace.json'), {
        name: CODEX_PLUGIN_MARKETPLACE,
        plugins: [{ name: manifest.name, source: { source: 'local', path: installedRoot } }],
      });
      fs.writeFileSync(
        path.join(codexHome, 'config.toml'),
        `[features]\nplugins = true\n\n[plugins.${tomlString(`${manifest.name}@${CODEX_PLUGIN_MARKETPLACE}`)}]\nenabled = true\n\n[projects.${tomlString(workspace)}]\ntrust_level = "trusted"\n`,
      );
      throwIfAborted(signal);
      const copiedAuth = copyCodexAuthIfConfigured(config, codexHome);
      writeJson(path.join(root, 'runtime.json'), {
        plugin: {
          name: manifest.name,
          version: pluginVersion,
          source: source.sourceType,
          sourceIdentity: source.sourceIdentity,
          sourceDigest: pluginSourceDigest,
          gitCommit: pluginGitCommit ?? null,
        },
        workspace,
        copiedAuth,
      });

      return {
        root,
        home,
        codexHome,
        tmpDir,
        artifactDir,
        exportedArtifactDir: resolveArtifactExportDir(
          config,
          artifactNamespace(context, this.id(), manifest.name, root),
        ),
        workspace,
        pluginName: manifest.name,
        pluginVersion,
        pluginSource: source.sourceType,
        pluginSourceIdentity: source.sourceIdentity,
        pluginSourceDigest,
        pluginGitCommit,
      };
    } catch (error) {
      await removeRuntime(root);
      throw error;
    }
  }

  private buildPrompt(prompt: string, config: OpenAICodexPluginConfig, pluginName: string): string {
    if (config.invocation) {
      return `${config.invocation}\n\n${prompt}`;
    }
    if (config.skill) {
      return `Use the ${pluginName}:${config.skill} skill.\n\n${prompt}`;
    }
    return prompt;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const config = parseCodexPluginConfig({
      ...this.config,
      ...(context?.prompt?.config as OpenAICodexPluginConfig | undefined),
    });
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;
    let timeout: NodeJS.Timeout | undefined;
    let runtime: CodexPluginRuntime | undefined;
    let sdkProvider: OpenAICodexSDKProvider | undefined;
    let response: ProviderResponse | undefined;
    let shutdownError: unknown;
    let artifactReferences: CodexPluginArtifactReference[] = [];
    const onAbort = () => {
      cancelled = true;
      controller.abort();
    };
    callOptions?.abortSignal?.addEventListener('abort', onAbort, { once: true });
    if (callOptions?.abortSignal?.aborted) {
      onAbort();
    }
    if (config.timeout_ms) {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, config.timeout_ms);
    }

    try {
      runtime = await this.createRuntime(config, context, controller.signal);
      sdkProvider = new OpenAICodexSDKProvider({
        id: this.id(),
        config: withoutPluginConfig(config, runtime),
        env: this.env,
      });
      this.activeProviders.add(sdkProvider);
      const sdkContext = context
        ? {
            ...context,
            prompt: {
              ...context.prompt,
              config: withoutPluginConfig(config, runtime),
            },
          }
        : context;
      try {
        response = await sdkProvider.callApi(
          this.buildPrompt(prompt, config, runtime.pluginName),
          sdkContext,
          { ...callOptions, abortSignal: controller.signal },
        );
      } catch (error) {
        logger.error('[CodexPlugin] Error calling OpenAI Codex plugin provider', { error });
        response = { error: errorMessage(error) };
      }
    } catch (error) {
      logger.error('[CodexPlugin] Error preparing OpenAI Codex plugin provider', { error });
      response = { error: errorMessage(error) };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      callOptions?.abortSignal?.removeEventListener('abort', onAbort);
      if (sdkProvider) {
        try {
          await sdkProvider.shutdown();
        } catch (error) {
          shutdownError = error;
        } finally {
          this.activeProviders.delete(sdkProvider);
        }
      }
      if (runtime) {
        try {
          artifactReferences = safelyExportArtifacts(runtime, config.retain_runtime === true);
        } finally {
          if (!config.retain_runtime) {
            await removeRuntime(runtime.root);
          }
        }
      }
    }

    const normalizedResponse = response ?? { error: 'Codex plugin provider returned no response' };
    const durationMs = Date.now() - startedAt;
    const plugin = runtime
      ? {
          name: runtime.pluginName,
          version: runtime.pluginVersion,
          source: runtime.pluginSource,
          sourceIdentity: runtime.pluginSourceIdentity,
          sourceDigest: runtime.pluginSourceDigest,
          gitCommit: runtime.pluginGitCommit ?? null,
        }
      : {
          name: null,
          version: config.plugin.version ?? null,
          source: config.plugin.path ? 'path' : 'package',
          sourceIdentity: sourceIdentity(config),
          sourceDigest: null,
          gitCommit: null,
        };
    const result: ProviderResponse = {
      ...normalizedResponse,
      latencyMs: durationMs,
      metadata: {
        ...normalizedResponse.metadata,
        codexPlugin: {
          plugin,
          invocation: config.skill ? `skill:${config.skill}` : (config.invocation ?? null),
          workspace: runtime?.workspace ?? config.workspace ?? config.working_dir ?? process.cwd(),
          status: terminalStatus(normalizedResponse, timedOut, cancelled),
          durationMs,
          traceIdentity: context?.traceparent ?? null,
          executionIdentity: executionIdentity(normalizedResponse),
          artifacts: artifactReferences,
        },
      },
    };
    if (shutdownError) {
      if (result.error) {
        logger.warn('[CodexPlugin] Ignoring shutdown error after primary provider error', {
          error: shutdownError,
        });
      } else {
        throw shutdownError;
      }
    }
    return result;
  }
}
