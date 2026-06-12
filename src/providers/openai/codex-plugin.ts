import { spawnSync } from 'child_process';
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

function assertTreeHasNoSymlinks(root: string): void {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    const entryStat = fs.lstatSync(entryPath);
    if (entryStat.isSymbolicLink()) {
      throw new Error(`Codex plugin trees may not contain symlinks: ${entryPath}`);
    }
    if (entryStat.isDirectory()) {
      assertTreeHasNoSymlinks(entryPath);
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

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed while resolving a Codex plugin source`);
  }
  return result.stdout;
}

function unpackPluginPackage(source: CodexPluginSource, runtimeRoot: string): string {
  const packageDir = path.join(runtimeRoot, 'package');
  fs.mkdirSync(packageDir, { recursive: true });
  const packageSpec = npmPackageSpec(source);
  const packOutput = runCommand(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packageDir, '--', packageSpec],
    runtimeRoot,
  );
  const packResult = z
    .array(z.object({ filename: z.string().min(1) }))
    .min(1)
    .parse(JSON.parse(packOutput));
  const archivePath = path.join(packageDir, packResult[0].filename);
  const archiveEntries = runCommand('tar', ['-tzf', archivePath], runtimeRoot)
    .split('\n')
    .filter(Boolean);
  for (const entry of archiveEntries) {
    checkTarEntry(entry);
  }

  const extractedRoot = path.join(packageDir, 'extracted');
  fs.mkdirSync(extractedRoot, { recursive: true });
  runCommand('tar', ['-xzf', archivePath, '-C', extractedRoot], runtimeRoot);
  return resolveExistingDirectory(path.join(extractedRoot, 'package'), 'Codex plugin package root');
}

function resolvePluginRoot(
  source: CodexPluginSource,
  runtimeRoot: string,
): {
  root: string;
  sourceIdentity: string;
  sourceType: CodexPluginRuntime['pluginSource'];
} {
  if (source.path) {
    const root = resolveExistingDirectory(source.path, 'Codex plugin path');
    return { root, sourceIdentity: `local:${path.basename(root)}`, sourceType: 'path' };
  }

  const packageSpec = npmPackageSpec(source);
  return {
    root: unpackPluginPackage(source, runtimeRoot),
    sourceIdentity: packageSpec,
    sourceType: 'package',
  };
}

function writeJson(pathToWrite: string, payload: unknown): void {
  fs.writeFileSync(pathToWrite, `${JSON.stringify(payload, null, 2)}\n`);
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function resolveArtifactExportDir(config: OpenAICodexPluginConfig): string | undefined {
  if (!config.artifacts_dir) {
    return undefined;
  }
  const artifactExportDir = path.resolve(config.artifacts_dir);
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

  private createRuntime(config: OpenAICodexPluginConfig): CodexPluginRuntime {
    const workspace = resolveExistingDirectory(
      config.workspace ?? config.working_dir ?? process.cwd(),
      'Codex plugin workspace',
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), CODEX_PLUGIN_RUNTIME_PREFIX));
    try {
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
        fs.mkdirSync(directory, { recursive: true });
      }

      const source = resolvePluginRoot(config.plugin, root);
      assertTreeHasNoSymlinks(source.root);
      const manifest = readPluginManifest(source.root);
      const pluginVersion =
        manifest.version ??
        config.plugin.version ??
        (source.sourceType === 'path' ? 'local' : 'unknown');
      const installedRoot = path.join(
        codexHome,
        'plugins',
        'cache',
        CODEX_PLUGIN_MARKETPLACE,
        sanitizePathSegment(manifest.name),
        sanitizePathSegment(pluginVersion),
      );
      fs.mkdirSync(path.dirname(installedRoot), { recursive: true });
      fs.cpSync(source.root, installedRoot, {
        recursive: true,
        dereference: false,
        errorOnExist: true,
      });

      writeJson(path.join(codexHome, '.agents', 'plugins', 'marketplace.json'), {
        name: CODEX_PLUGIN_MARKETPLACE,
        plugins: [{ name: manifest.name, source: { source: 'local', path: installedRoot } }],
      });
      fs.writeFileSync(
        path.join(codexHome, 'config.toml'),
        `[features]\nplugins = true\n\n[plugins.${tomlString(`${manifest.name}@${CODEX_PLUGIN_MARKETPLACE}`)}]\nenabled = true\n\n[projects.${tomlString(workspace)}]\ntrust_level = "trusted"\n`,
      );
      const copiedAuth = copyCodexAuthIfConfigured(config, codexHome);
      writeJson(path.join(root, 'runtime.json'), {
        plugin: {
          name: manifest.name,
          version: pluginVersion,
          source: source.sourceType,
          sourceIdentity: source.sourceIdentity,
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
        exportedArtifactDir: resolveArtifactExportDir(config),
        workspace,
        pluginName: manifest.name,
        pluginVersion,
        pluginSource: source.sourceType,
        pluginSourceIdentity: source.sourceIdentity,
      };
    } catch (error) {
      fs.rmSync(root, { recursive: true, force: true });
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
    const runtime = this.createRuntime(config);
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;
    let timeout: NodeJS.Timeout | undefined;
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

    const sdkProvider = new OpenAICodexSDKProvider({
      id: this.id(),
      config: withoutPluginConfig(config, runtime),
      env: this.env,
    });
    this.activeProviders.add(sdkProvider);

    try {
      const sdkContext = context
        ? {
            ...context,
            prompt: {
              ...context.prompt,
              config: withoutPluginConfig(config, runtime),
            },
          }
        : context;
      const response = await sdkProvider.callApi(
        this.buildPrompt(prompt, config, runtime.pluginName),
        sdkContext,
        { ...callOptions, abortSignal: controller.signal },
      );
      const durationMs = Date.now() - startedAt;
      const artifactReferences = exportArtifacts(
        runtime,
        collectArtifactReferences(runtime),
        config.retain_runtime === true,
      );
      return {
        ...response,
        latencyMs: durationMs,
        metadata: {
          ...response.metadata,
          codexPlugin: {
            plugin: {
              name: runtime.pluginName,
              version: runtime.pluginVersion,
              source: runtime.pluginSource,
              sourceIdentity: runtime.pluginSourceIdentity,
            },
            invocation: config.skill ? `skill:${config.skill}` : (config.invocation ?? null),
            workspace: runtime.workspace,
            status: terminalStatus(response, timedOut, cancelled),
            durationMs,
            traceIdentity: context?.traceparent ?? null,
            artifacts: artifactReferences,
          },
        },
      };
    } catch (error) {
      logger.error('[CodexPlugin] Error calling OpenAI Codex plugin provider', { error });
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      callOptions?.abortSignal?.removeEventListener('abort', onAbort);
      await sdkProvider.shutdown();
      this.activeProviders.delete(sdkProvider);
      if (!config.retain_runtime) {
        fs.rmSync(runtime.root, { recursive: true, force: true });
      }
    }
  }
}
