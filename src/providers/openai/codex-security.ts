import { type ChildProcess, execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

import dedent from 'dedent';
import semverSatisfies from 'semver/functions/satisfies.js';
import { z } from 'zod';
import cliState from '../../cliState';
import { getDirectory, importModule, resolvePackageEntryPoint } from '../../esm';
import logger from '../../logger';
import { renderVarsInObject } from '../../util/render';
import { resolveAgenticWorkingDir } from '../agentic-utils';
import { providerRegistry } from '../providerRegistry';
import type {
  CodexSecurity,
  JsonObject,
  ScanCost,
  ScanOptions,
  ScanResult,
  ValidationOptions,
} from '@openai/codex-security';

import type { TokenUsage } from '../../contracts/shared';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

export const CODEX_SECURITY_OPERATIONS = [
  'security-scan',
  'deep-security-scan',
  'security-diff-scan',
  'validation',
  'fix-finding',
  'verify-fix',
  'threat-model',
  'finding-discovery',
  'attack-path-analysis',
  'triage-finding',
  'define-security-policy',
  'propose-security-hardening',
  'vulnerability-writeup',
  'track-findings',
] as const;

export type CodexSecurityOperation = (typeof CODEX_SECURITY_OPERATIONS)[number];

const MINIMUM_CODEX_SECURITY_SDK_VERSION = '0.1.18';

const ReasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

const CodexSecurityConfigSchema = z
  .object({
    basePath: z.string().optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    provider: z.unknown().optional(),
    linkedTargetId: z.string().optional(),
    maxRetries: z.number().int().nonnegative().optional(),
    operation: z.enum(CODEX_SECURITY_OPERATIONS).optional(),
    model: z.string().min(1).optional(),
    model_provider: z.string().min(1).optional(),
    model_reasoning_effort: ReasoningEffortSchema.optional(),
    reasoning_effort: ReasoningEffortSchema.optional(),
    repository: z.string().min(1).optional(),
    working_dir: z.string().min(1).optional(),
    paths: z.array(z.string().min(1)).min(1).optional(),
    base_ref: z.string().min(1).optional(),
    head_ref: z.string().min(1).optional(),
    working_tree: z.boolean().optional(),
    output_dir: z.string().min(1).optional(),
    archive_existing: z.boolean().optional(),
    knowledge_base_paths: z.array(z.string().min(1)).optional(),
    scan_prompt: z.string().optional(),
    validation_prompt: z.string().optional(),
    post_scan_prompt: z.string().optional(),
    expected_plugin_version: z.string().optional(),
    failure_severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    max_cost_usd: z.number().positive().optional(),
    workers: z.number().int().positive().optional(),
    subagents: z.number().int().nonnegative().optional(),
    stop_after_no_new: z.number().int().nonnegative().optional(),
    max_discovery_runs: z.number().int().positive().optional(),
    max_time_hours: z.number().positive().optional(),
    auth: z.enum(['auto', 'chatgpt', 'api-key']).optional(),
    plugin_path: z.string().min(1).optional(),
    python_path: z.string().min(1).optional(),
    codex_overrides: z.record(z.string(), z.unknown()).optional(),
    finding: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    finding_file: z.string().min(1).optional(),
    finding_id: z.string().min(1).optional(),
    scan_id: z.string().min(1).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    codex_home: z.string().min(1).optional(),
    sandbox_mode: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
    cli_env: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    enable_streaming: z.boolean().optional(),
    deep_tracing: z.boolean().optional(),
    allow_file_writes: z.boolean().optional(),
    allow_external_writes: z.boolean().optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (
      config.model_reasoning_effort &&
      config.reasoning_effort &&
      config.model_reasoning_effort !== config.reasoning_effort
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reasoning_effort'],
        message: 'reasoning_effort and model_reasoning_effort must match when both are set',
      });
    }

    if (config.working_tree && config.head_ref) {
      context.addIssue({
        code: 'custom',
        path: ['head_ref'],
        message: 'head_ref cannot be combined with working_tree',
      });
    }

    if (config.paths && (config.base_ref || config.head_ref || config.working_tree)) {
      context.addIssue({
        code: 'custom',
        path: ['paths'],
        message: 'paths cannot be combined with a diff target',
      });
    }
  });

export type OpenAICodexSecurityConfig = z.infer<typeof CodexSecurityConfigSchema>;

type CodexSecurityModule = typeof import('@openai/codex-security');

interface LoadedCodexSecurity {
  module: CodexSecurityModule;
  entryPoint: string;
}

interface ScanObservers {
  cost?: ScanCost;
  progress?: unknown;
  warnings: string[];
}

function configError(error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
    .join('; ');
  return new Error(`Invalid OpenAI Codex Security provider configuration: ${details}`);
}

function parseConfig(config: unknown = {}): OpenAICodexSecurityConfig {
  const parsed = CodexSecurityConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw configError(parsed.error);
  }
  return parsed.data;
}

async function loadCodexSecurity(): Promise<LoadedCodexSecurity> {
  const basePaths = [
    cliState.basePath ? path.resolve(cliState.basePath) : undefined,
    process.cwd(),
    path.resolve(getDirectory(), '..'),
    path.resolve(getDirectory(), '../..'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const visitedEntryPoints = new Set<string>();
  const incompatibleVersions = new Set<string>();

  for (const basePath of new Set(basePaths)) {
    const entryPoint = resolvePackageEntryPoint('@openai/codex-security', basePath);
    if (!entryPoint || visitedEntryPoints.has(entryPoint)) {
      continue;
    }
    visitedEntryPoints.add(entryPoint);

    try {
      const module = (await importModule(entryPoint)) as CodexSecurityModule;
      const version = typeof module.VERSION === 'string' ? module.VERSION : 'unknown';
      if (!semverSatisfies(version, `>=${MINIMUM_CODEX_SECURITY_SDK_VERSION}`)) {
        incompatibleVersions.add(version);
        logger.warn(
          `[CodexSecurity] Ignoring @openai/codex-security ${version}; version ${MINIMUM_CODEX_SECURITY_SDK_VERSION} or newer is required for complete security operations and deep-scan usage accounting.`,
        );
        continue;
      }

      return { module, entryPoint };
    } catch (error) {
      logger.debug('[CodexSecurity] Failed to load SDK', { error });
      throw new Error(
        dedent`Failed to load @openai/codex-security.

        The package requires a supported even-numbered Node.js release: ^22.13.0, ^24.0.0, or ^26.0.0.
        Reinstall it with:
          npm install @openai/codex-security

        See https://www.promptfoo.dev/docs/providers/openai-codex-security/`,
      );
    }
  }

  if (incompatibleVersions.size > 0) {
    throw new Error(
      dedent`The installed @openai/codex-security package is incompatible (${Array.from(incompatibleVersions).join(', ')}).

      Version ${MINIMUM_CODEX_SECURITY_SDK_VERSION} or newer is required for standalone finding validation, complete security skills, and accurate deep-worker cost tracking.
      Upgrade it with:
        npm install @openai/codex-security@^${MINIMUM_CODEX_SECURITY_SDK_VERSION}

      See https://www.promptfoo.dev/docs/providers/openai-codex-security/`,
    );
  }

  throw new Error(
    dedent`The @openai/codex-security package is required but not installed.

    Install it with:
      npm install @openai/codex-security

    Requires Node.js ^22.13.0, ^24.0.0, or ^26.0.0.
    See https://www.promptfoo.dev/docs/providers/openai-codex-security/`,
  );
}

function resolveConfigPath(value: string | undefined): string | undefined {
  return resolveAgenticWorkingDir(value, cliState.basePath);
}

function getTokenUsage(result: ScanResult, observedCost?: ScanCost): TokenUsage | undefined {
  const usage = result.turnResult.usage;
  const values = usage && typeof usage === 'object' ? (usage as Record<string, unknown>) : {};
  const cost = result.cost ?? observedCost;
  const inputTokens =
    typeof values.input_tokens === 'number' ? values.input_tokens : cost?.inputTokens;
  const outputTokens =
    typeof values.output_tokens === 'number' ? values.output_tokens : cost?.outputTokens;
  const cachedTokens =
    typeof values.cached_input_tokens === 'number'
      ? values.cached_input_tokens
      : cost?.cachedInputTokens;
  const cacheWriteTokens =
    typeof values.cache_write_input_tokens === 'number'
      ? values.cache_write_input_tokens
      : cost?.cacheWriteInputTokens;
  const reasoningTokens =
    typeof values.reasoning_output_tokens === 'number' ? values.reasoning_output_tokens : undefined;

  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }

  const completionDetails = {
    ...(reasoningTokens === undefined ? {} : { reasoning: reasoningTokens }),
    ...(cachedTokens === undefined ? {} : { cacheReadInputTokens: cachedTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheCreationInputTokens: cacheWriteTokens }),
  };

  return {
    ...(inputTokens === undefined ? {} : { prompt: inputTokens }),
    ...(outputTokens === undefined ? {} : { completion: outputTokens }),
    ...(cachedTokens === undefined ? {} : { cached: cachedTokens }),
    ...(inputTokens === undefined || outputTokens === undefined
      ? {}
      : { total: inputTokens + outputTokens }),
    ...(Object.keys(completionDetails).length > 0 ? { completionDetails } : {}),
  };
}

function parseCliOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export class OpenAICodexSecurityProvider implements ApiProvider {
  readonly config: OpenAICodexSecurityConfig;
  readonly env?: EnvOverrides;

  private readonly providerId: string;
  private readonly activeClients = new Set<CodexSecurity>();
  private readonly activeChildren = new Set<ChildProcess>();

  constructor(
    options: { id?: string; config?: OpenAICodexSecurityConfig; env?: EnvOverrides } = {},
  ) {
    this.config = parseConfig(options.config);
    this.env = options.env;
    this.providerId = options.id ?? 'openai:codex-security';
    providerRegistry.register(this);
  }

  id(): string {
    return this.providerId;
  }

  requiresApiKey(): boolean {
    return false;
  }

  toString(): string {
    return '[OpenAI Codex Security Provider]';
  }

  async cleanup(): Promise<void> {
    for (const child of this.activeChildren) {
      child.kill();
    }
    this.activeChildren.clear();

    const clients = Array.from(this.activeClients);
    this.activeClients.clear();
    const results = await Promise.allSettled(clients.map((client) => client.close()));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn('[CodexSecurity] Error while closing SDK client', { error: result.reason });
      }
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.cleanup();
    } finally {
      providerRegistry.unregister(this);
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      const mergedConfig = { ...this.config, ...context?.prompt?.config };
      delete mergedConfig.provider;
      const config = parseConfig(renderVarsInObject(mergedConfig, context?.vars));
      const operation = config.operation ?? 'security-scan';
      const repositoryVariable = context?.vars?.repository;
      const configuredRepository =
        config.repository ??
        config.working_dir ??
        (typeof repositoryVariable === 'string' ? repositoryVariable : undefined);
      const repository = resolveConfigPath(configuredRepository) ?? process.cwd();

      if (
        (operation === 'fix-finding' || operation === 'define-security-policy') &&
        config.allow_file_writes !== true
      ) {
        return {
          error: `Codex Security operation "${operation}" changes repository files. Set allow_file_writes: true and evaluate an isolated repository checkout.`,
        };
      }

      if (operation === 'track-findings' && config.allow_external_writes !== true) {
        return {
          error:
            'Codex Security operation "track-findings" can create or update external issues. Set allow_external_writes: true to enable it.',
        };
      }

      if (callOptions?.abortSignal?.aborted) {
        return { error: 'Codex Security operation was aborted before it started.' };
      }

      if (operation === 'fix-finding' || operation === 'verify-fix') {
        return await this.runCliOperation(prompt, repository, operation, config, callOptions);
      }

      if (
        operation !== 'security-scan' &&
        operation !== 'deep-security-scan' &&
        operation !== 'security-diff-scan' &&
        operation !== 'validation'
      ) {
        return await this.runStandaloneSkill(
          prompt,
          repository,
          operation,
          config,
          context,
          callOptions,
        );
      }

      const { module } = await loadCodexSecurity();
      const effort = config.model_reasoning_effort ?? config.reasoning_effort;
      const codexOverrides = {
        ...config.codex_overrides,
        ...(config.model ? { model: config.model } : {}),
        ...(config.model_provider ? { model_provider: config.model_provider } : {}),
        ...(effort ? { model_reasoning_effort: effort } : {}),
      } as JsonObject;
      const client = new module.CodexSecurity({
        ...(config.plugin_path ? { pluginPath: resolveConfigPath(config.plugin_path) } : {}),
        ...(config.python_path ? { pythonPath: resolveConfigPath(config.python_path) } : {}),
        ...(Object.keys(codexOverrides).length > 0 ? { codexOverrides } : {}),
      });
      this.activeClients.add(client);

      try {
        if (operation === 'validation') {
          return await this.runValidation(client, prompt, repository, config, context, callOptions);
        }

        return await this.runScan(
          client,
          module,
          prompt,
          repository,
          operation,
          config,
          callOptions,
        );
      } finally {
        this.activeClients.delete(client);
        await client.close();
      }
    } catch (error) {
      return {
        error: `Codex Security operation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async runScan(
    client: CodexSecurity,
    module: CodexSecurityModule,
    prompt: string,
    repository: string,
    operation: 'security-scan' | 'deep-security-scan' | 'security-diff-scan',
    config: OpenAICodexSecurityConfig,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const mode = operation === 'deep-security-scan' ? 'deep' : 'standard';
    const targetResult = this.getScanTarget(module, operation, config);
    if ('error' in targetResult) {
      return targetResult;
    }

    const observers: ScanObservers = { warnings: [] };
    const options = this.buildScanOptions(
      prompt,
      mode,
      targetResult.target,
      config,
      observers,
      callOptions,
    );
    const result = await client.run(repository, options);
    return this.buildScanResponse(result, module, repository, operation, mode, config, observers);
  }

  private getScanTarget(
    module: CodexSecurityModule,
    operation: 'security-scan' | 'deep-security-scan' | 'security-diff-scan',
    config: OpenAICodexSecurityConfig,
  ): { target: ScanOptions['target'] } | { error: string } {
    if (operation === 'security-diff-scan') {
      if (config.working_tree) {
        return {
          target: module.DiffTarget.workingTree(
            config.base_ref ? { base: config.base_ref } : undefined,
          ),
        };
      }
      if (config.base_ref) {
        return {
          target: module.DiffTarget.refs({
            base: config.base_ref,
            ...(config.head_ref ? { head: config.head_ref } : {}),
          }),
        };
      }
      return {
        error: 'Codex Security security-diff-scan requires base_ref or working_tree: true.',
      };
    }

    if (config.base_ref || config.head_ref || config.working_tree) {
      return {
        error: 'Git diff target options require operation: security-diff-scan.',
      };
    }

    return { target: config.paths ?? 'repository' };
  }

  private buildScanOptions(
    prompt: string,
    mode: 'standard' | 'deep',
    target: ScanOptions['target'],
    config: OpenAICodexSecurityConfig,
    observers: ScanObservers,
    callOptions?: CallApiOptionsParams,
  ): ScanOptions {
    const scanPrompt = [config.scan_prompt, prompt].filter(Boolean).join('\n\n');
    return {
      mode,
      target,
      ...(scanPrompt ? { scanPrompt } : {}),
      ...(config.auth ? { auth: config.auth } : {}),
      ...(config.output_dir ? { outputDir: resolveConfigPath(config.output_dir) } : {}),
      ...(config.archive_existing === undefined
        ? {}
        : { archiveExisting: config.archive_existing }),
      ...(config.knowledge_base_paths
        ? {
            knowledgeBasePaths: config.knowledge_base_paths.map(
              (knowledgePath) => resolveConfigPath(knowledgePath)!,
            ),
          }
        : {}),
      ...(config.validation_prompt ? { validationPrompt: config.validation_prompt } : {}),
      ...(config.post_scan_prompt ? { postScanPrompt: config.post_scan_prompt } : {}),
      ...(config.expected_plugin_version
        ? { expectedPluginVersion: config.expected_plugin_version }
        : {}),
      ...(config.failure_severity ? { failureSeverity: config.failure_severity } : {}),
      ...(config.max_cost_usd === undefined ? {} : { maxCostUsd: config.max_cost_usd }),
      ...this.buildDeepScanOptions(mode, config),
      ...(callOptions?.abortSignal ? { signal: callOptions.abortSignal } : {}),
      onCost: (cost) => {
        observers.cost = { ...cost };
      },
      onProgress: (progress) => {
        observers.progress = progress;
      },
      onWarning: (warning) => {
        observers.warnings.push(warning);
      },
    };
  }

  private buildDeepScanOptions(
    mode: 'standard' | 'deep',
    config: OpenAICodexSecurityConfig,
  ): Partial<ScanOptions> {
    if (mode !== 'deep') {
      return {};
    }

    return {
      ...(config.workers === undefined ? {} : { workers: config.workers }),
      ...(config.subagents === undefined ? {} : { subagents: config.subagents }),
      ...(config.stop_after_no_new === undefined
        ? {}
        : { stopAfterNoNew: config.stop_after_no_new }),
      ...(config.max_discovery_runs === undefined
        ? {}
        : { maxDiscoveryRuns: config.max_discovery_runs }),
      ...(config.max_time_hours === undefined ? {} : { maxTimeHours: config.max_time_hours }),
    };
  }

  private buildScanResponse(
    result: ScanResult,
    module: CodexSecurityModule,
    repository: string,
    operation: 'security-scan' | 'deep-security-scan' | 'security-diff-scan',
    mode: 'standard' | 'deep',
    config: OpenAICodexSecurityConfig,
    observers: ScanObservers,
  ): ProviderResponse {
    const cost = result.cost ?? observers.cost;
    const tokenUsage = getTokenUsage(result, observers.cost);
    const findings = Array.isArray(result.findings?.findings) ? result.findings.findings : [];
    const model = result.turnResult.model ?? cost?.model ?? config.model;

    return {
      output: JSON.stringify(result.toJSON()),
      format: 'json',
      raw: result.toJSON(),
      cached: false,
      sessionId: result.threadId,
      ...(cost ? { cost: cost.estimatedUsd } : {}),
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(typeof result.turnResult.durationMs === 'number'
        ? { latencyMs: result.turnResult.durationMs }
        : {}),
      metadata: {
        operation,
        mode,
        repository,
        ...(model ? { model } : {}),
        ...(config.model_reasoning_effort || config.reasoning_effort
          ? { reasoningEffort: config.model_reasoning_effort ?? config.reasoning_effort }
          : {}),
        findingsCount: findings.length,
        coverage: result.coverage,
        scanDir: result.scanDir,
        reportPath: result.reportPath,
        findingsPath: result.findingsPath,
        coveragePath: result.coveragePath,
        ...(result.sarifPath ? { sarifPath: result.sarifPath } : {}),
        pluginVersion: result.pluginVersion,
        sdkVersion: module.VERSION,
        ...(observers.progress ? { progress: observers.progress } : {}),
        ...(observers.warnings.length > 0 ? { warnings: observers.warnings } : {}),
        skillCalls: [{ name: operation }],
      },
    };
  }

  private async runValidation(
    client: CodexSecurity,
    prompt: string,
    repository: string,
    config: OpenAICodexSecurityConfig,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const findingVariable = context?.vars?.finding;
    const contextualFinding =
      typeof findingVariable === 'string' ||
      (findingVariable !== null &&
        typeof findingVariable === 'object' &&
        !Array.isArray(findingVariable))
        ? findingVariable
        : undefined;
    let finding: string | object = config.finding ?? contextualFinding ?? prompt;
    if (config.finding_file) {
      const findingContents = await fs.readFile(resolveConfigPath(config.finding_file)!, 'utf8');
      try {
        finding = JSON.parse(findingContents) as object;
      } catch {
        finding = findingContents;
      }
    }

    const options: ValidationOptions = {
      repositoryPath: repository,
      finding,
      ...(config.auth ? { auth: config.auth } : {}),
      ...(config.output_dir ? { outputDir: resolveConfigPath(config.output_dir) } : {}),
      ...(callOptions?.abortSignal ? { signal: callOptions.abortSignal } : {}),
    };
    const result = await client.validate(options);

    return {
      output: JSON.stringify(result),
      format: 'json',
      raw: result,
      cached: false,
      ...(result.threadId ? { sessionId: result.threadId } : {}),
      metadata: {
        operation: 'validation',
        repository,
        disposition: result.disposition,
        outputDir: result.outputDir,
        ...(config.model ? { model: config.model } : {}),
        skillCalls: [{ name: 'validation' }],
      },
    };
  }

  private async runCliOperation(
    prompt: string,
    repository: string,
    operation: 'fix-finding' | 'verify-fix',
    config: OpenAICodexSecurityConfig,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { entryPoint } = await loadCodexSecurity();
    const executable = path.resolve(path.dirname(entryPoint), '../bin/codex-security.mjs');
    const command = operation === 'fix-finding' ? 'patch' : 'verify-fix';
    const args = [executable, command];
    const effort = config.model_reasoning_effort ?? config.reasoning_effort;

    if (config.model_provider) {
      return {
        error: `Codex Security ${command} does not support the model_provider override.`,
      };
    }

    if (effort === 'ultra') {
      return {
        error: `Codex Security ${command} supports reasoning effort through max, but does not support ultra.`,
      };
    }

    if (config.severity && !config.scan_id && !config.finding_id) {
      return {
        error: `Codex Security ${command} severity filtering requires scan_id or finding_id.`,
      };
    }

    if (config.model) {
      args.push('--codex', `model=${JSON.stringify(config.model)}`);
    }
    if (effort) {
      args.push('--effort', effort);
    }
    if (config.scan_id) {
      args.push('--scan', config.scan_id);
    }
    if (config.severity) {
      args.push('--severity', config.severity);
    }
    if (config.finding_id) {
      args.push(config.finding_id);
    } else if (!config.scan_id) {
      const finding = config.finding_file
        ? resolveConfigPath(config.finding_file)!
        : (config.finding ?? prompt);
      args.push(typeof finding === 'string' ? finding : JSON.stringify(finding));
    }
    if (operation === 'verify-fix' || config.scan_id || config.finding_id) {
      args.push('--format', 'json');
    }

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...Object.fromEntries(
        Object.entries(config.cli_env ?? {}).map(([key, value]) => [key, String(value)]),
      ),
      ...(config.codex_home ? { CODEX_HOME: resolveConfigPath(config.codex_home) } : {}),
    };

    return new Promise<ProviderResponse>((resolve) => {
      let child: ChildProcess;
      child = execFile(
        process.execPath,
        args,
        {
          cwd: repository,
          env: childEnv,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          ...(callOptions?.abortSignal ? { signal: callOptions.abortSignal } : {}),
        },
        (error, stdout) => {
          this.activeChildren.delete(child);
          const output = parseCliOutput(stdout ?? '');
          if (error && (output === undefined || typeof output === 'string')) {
            const code = typeof error.code === 'number' ? ` (exit code ${error.code})` : '';
            resolve({ error: `Codex Security ${command} failed${code}.` });
            return;
          }

          const structured = output !== undefined && typeof output !== 'string';
          resolve({
            output: structured ? JSON.stringify(output) : output,
            ...(structured ? { format: 'json', raw: output } : {}),
            cached: false,
            metadata: {
              operation,
              repository,
              ...(config.model ? { model: config.model } : {}),
              ...(effort ? { reasoningEffort: effort } : {}),
              ...(typeof error?.code === 'number' ? { exitCode: error.code } : {}),
              skillCalls: [{ name: operation }],
            },
          });
        },
      );
      this.activeChildren.add(child);
    });
  }

  private async runStandaloneSkill(
    prompt: string,
    repository: string,
    operation: CodexSecurityOperation,
    config: OpenAICodexSecurityConfig,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { OpenAICodexSDKProvider } = await import('./codex-sdk');
    const effort = config.model_reasoning_effort ?? config.reasoning_effort;
    const provider = new OpenAICodexSDKProvider({
      id: this.providerId,
      env: this.env,
      config: {
        ...(config.model ? { model: config.model } : {}),
        ...(config.model_provider ? { model_provider: config.model_provider } : {}),
        ...(effort ? { model_reasoning_effort: effort } : {}),
        ...(config.maxRetries === undefined ? {} : { maxRetries: config.maxRetries }),
        working_dir: repository,
        sandbox_mode:
          config.sandbox_mode ?? (config.allow_file_writes ? 'workspace-write' : 'read-only'),
        approval_policy: 'never',
        enable_streaming: config.enable_streaming ?? true,
        ...(config.deep_tracing === undefined ? {} : { deep_tracing: config.deep_tracing }),
        cli_env: {
          ...config.cli_env,
          ...(config.codex_home ? { CODEX_HOME: resolveConfigPath(config.codex_home)! } : {}),
        },
      },
    });

    try {
      const skillPrompt = `Use $codex-security:${operation} to complete this task.\n\n${prompt}`;
      const delegatedContext = context
        ? {
            ...context,
            prompt: {
              ...context.prompt,
              config: undefined,
            },
          }
        : undefined;
      const response = await provider.callApi(skillPrompt, delegatedContext, callOptions);
      return {
        ...response,
        metadata: {
          ...response.metadata,
          operation,
          repository,
          ...(config.model ? { model: config.model } : {}),
        },
      };
    } finally {
      await provider.shutdown();
    }
  }
}
