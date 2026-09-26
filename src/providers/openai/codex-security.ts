import fs from 'fs/promises';
import path from 'path';

import dedent from 'dedent';
import semverSatisfies from 'semver/functions/satisfies.js';
import { z } from 'zod';
import { resolveAgenticWorkingDir } from '../agentic-utils';
import { providerRegistry } from '../providerRegistry';
import {
  cliState,
  getDirectory,
  importModule,
  logger,
  renderVarsInObject,
  resolvePackageEntryPoint,
} from './codex-runtime';
import { createCodexSecurityReplayHeader, readCodexSecurityReport } from './codex-security-report';
import { normalizeCodexSecurityResult } from './codex-security-result';
import type {
  CodexSecurity,
  JsonObject,
  ScanCost,
  ScanOptions,
  ScanResult,
  ValidationOptions,
} from '@openai/codex-security';

import type { CodexSecurityResult } from '../../contracts/codexSecurity';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';

export const CODEX_SECURITY_OPERATIONS = [
  'security-scan',
  'deep-security-scan',
  'security-diff-scan',
  'validation',
] as const;

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
    report_file: z.string().trim().min(1).optional(),
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
    stop_after_no_new: z.number().int().positive().optional(),
    max_discovery_runs: z.number().int().positive().optional(),
    max_time_hours: z.number().positive().max(96).optional(),
    auth: z.enum(['auto', 'chatgpt', 'api-key']).optional(),
    plugin_path: z.string().min(1).optional(),
    python_path: z.string().min(1).optional(),
    codex_overrides: z.record(z.string(), z.unknown()).optional(),
    finding: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    finding_file: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.report_file) {
      return;
    }
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

const CodexSecurityMergedPromptConfigSchema = CodexSecurityConfigSchema.strip();

export type OpenAICodexSecurityConfig = z.infer<typeof CodexSecurityConfigSchema>;

type CodexSecurityModule = typeof import('@openai/codex-security');

interface ScanObservers {
  cost?: ScanCost;
  progress?: unknown;
  outputDir?: string;
  warnings: string[];
  notify?: (phase?: string) => void;
}

interface OperationContext {
  importingReport: boolean;
  reportFile?: string;
  operation: OpenAICodexSecurityConfig['operation'];
  phase: NonNullable<CodexSecurityResult['diagnostics']>['phase'];
  sdkVersion?: string;
}

function configError(error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
    .join('; ');
  return new Error(`Invalid OpenAI Codex Security provider configuration: ${details}`);
}

function parseConfig(
  config: unknown = {},
  options: { stripUnknownKeys?: boolean } = {},
): OpenAICodexSecurityConfig {
  const schema = options.stripUnknownKeys
    ? CodexSecurityMergedPromptConfigSchema
    : CodexSecurityConfigSchema;
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    throw configError(parsed.error);
  }
  return parsed.data;
}

async function loadCodexSecurity(): Promise<CodexSecurityModule> {
  const basePaths = [path.resolve(getDirectory(), '..'), path.resolve(getDirectory(), '../..')];
  const visitedEntryPoints = new Set<string>();
  const incompatibleVersions = new Set<string>();
  let importFailed = false;

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

      return module;
    } catch (error) {
      logger.debug('[CodexSecurity] Failed to load SDK', { error });
      importFailed = true;
    }
  }

  if (importFailed) {
    throw new Error(
      dedent`Failed to load @openai/codex-security.

      Promptfoo and the SDK require a supported even-numbered Node.js release: ^22.22.0, ^24.0.0, or ^26.0.0.
      Reinstall them together with:
        npm install promptfoo @openai/codex-security

      See https://www.promptfoo.dev/docs/providers/openai-codex-security/`,
    );
  }

  if (incompatibleVersions.size > 0) {
    throw new Error(
      dedent`The installed @openai/codex-security package is incompatible (${Array.from(incompatibleVersions).join(', ')}).

      Version ${MINIMUM_CODEX_SECURITY_SDK_VERSION} or newer is required for finding validation and accurate deep-worker cost tracking.
      Install the compatible SDK alongside Promptfoo with:
        npm install promptfoo @openai/codex-security@^${MINIMUM_CODEX_SECURITY_SDK_VERSION}

      See https://www.promptfoo.dev/docs/providers/openai-codex-security/`,
    );
  }

  throw new Error(
    dedent`The @openai/codex-security package is required but not installed.

    Install it alongside Promptfoo with:
      npm install promptfoo @openai/codex-security

    Requires Node.js ^22.22.0, ^24.0.0, or ^26.0.0.
    See https://www.promptfoo.dev/docs/providers/openai-codex-security/`,
  );
}

function resolveConfigPath(value: string | undefined, configBasePath?: string): string | undefined {
  return resolveAgenticWorkingDir(value, configBasePath ?? cliState.basePath);
}

function getTokenUsage(result?: ScanResult, observedCost?: ScanCost): TokenUsage | undefined {
  const usage = result?.turnResult?.usage;
  const values = usage && typeof usage === 'object' ? (usage as Record<string, unknown>) : {};
  const cost = result?.cost ?? observedCost;
  const inputTokens =
    cost?.inputTokens ??
    (typeof values.input_tokens === 'number' ? values.input_tokens : undefined);
  const outputTokens =
    cost?.outputTokens ??
    (typeof values.output_tokens === 'number' ? values.output_tokens : undefined);
  const cachedTokens =
    cost?.cachedInputTokens ??
    (typeof values.cached_input_tokens === 'number' ? values.cached_input_tokens : undefined);
  const cacheWriteTokens =
    (cost?.cacheWriteInputTokensReported ?? values.cache_write_input_tokens_reported) === false
      ? undefined
      : (cost?.cacheWriteInputTokens ??
        (typeof values.cache_write_input_tokens === 'number'
          ? values.cache_write_input_tokens
          : undefined));
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

export class OpenAICodexSecurityProvider implements ApiProvider {
  readonly config: OpenAICodexSecurityConfig;
  readonly env?: EnvOverrides;
  readonly checkSetupOnEval = true;
  readonly supportsProgress = true;

  private readonly providerId: string;
  private readonly activeClients = new Set<CodexSecurity>();

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

  private environmentError(): string | undefined {
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY'] as const) {
      if (this.env?.[key] && this.env[key] !== process.env[key]) {
        return `Codex Security does not support provider-scoped ${key}. Set ${key} in the Promptfoo process environment before running the evaluation.`;
      }
    }
    return undefined;
  }

  private createClient(module: CodexSecurityModule, config: OpenAICodexSecurityConfig) {
    const effort = config.model_reasoning_effort ?? config.reasoning_effort;
    const codexOverrides = {
      ...config.codex_overrides,
      ...(config.model ? { model: config.model } : {}),
      ...(config.model_provider ? { model_provider: config.model_provider } : {}),
      ...(effort ? { model_reasoning_effort: effort } : {}),
    } as JsonObject;
    return new module.CodexSecurity({
      ...(config.plugin_path
        ? { pluginPath: resolveConfigPath(config.plugin_path, config.basePath) }
        : {}),
      ...(config.python_path
        ? { pythonPath: resolveConfigPath(config.python_path, config.basePath) }
        : {}),
      ...(Object.keys(codexOverrides).length > 0 ? { codexOverrides } : {}),
    });
  }

  private operationContext(context?: CallApiContextParams): OperationContext {
    const config = { ...this.config, ...context?.prompt?.config };
    return {
      importingReport: config.report_file !== undefined,
      reportFile: typeof config.report_file === 'string' ? config.report_file : undefined,
      operation: this.config.operation ?? 'security-scan',
      phase: 'configuration',
    };
  }

  private resolveConfig(context?: CallApiContextParams): OpenAICodexSecurityConfig {
    const mergedConfig = { ...this.config, ...context?.prompt?.config };
    delete mergedConfig.provider;
    // Retained native settings may reference variables absent from import-only rows.
    const renderedConfig =
      mergedConfig.report_file === undefined
        ? renderVarsInObject(mergedConfig, context?.vars)
        : {
            ...mergedConfig,
            ...renderVarsInObject(
              { report_file: mergedConfig.report_file, basePath: mergedConfig.basePath },
              context?.vars,
            ),
          };
    return parseConfig(renderedConfig, { stripUnknownKeys: true });
  }

  private repository(config: OpenAICodexSecurityConfig, context?: CallApiContextParams): string {
    const repositoryVariable = context?.vars?.repository;
    return (
      resolveConfigPath(
        config.repository ??
          config.working_dir ??
          (typeof repositoryVariable === 'string' ? repositoryVariable : undefined),
        config.basePath,
      ) ?? process.cwd()
    );
  }

  private failureResponse(
    message: string,
    attempt: OperationContext,
    observers: ScanObservers = { warnings: [] },
    canceled = false,
  ): ProviderResponse {
    const observedCost = observers.cost;
    const tokenUsage = observedCost ? getTokenUsage(undefined, observedCost) : undefined;
    const summary = normalizeCodexSecurityResult(undefined, {
      source: attempt.importingReport
        ? { kind: 'saved-report', file: attempt.reportFile }
        : { kind: 'sdk' },
      ...(attempt.importingReport ? {} : { operation: attempt.operation }),
      status: canceled ? 'canceled' : 'failed',
      error: message,
      sdkVersion: attempt.sdkVersion,
      observedCost,
      warnings: observers.warnings,
      diagnostics: { phase: attempt.phase, warningAvailability: 'unknown' },
      artifactPaths: { scanDir: observers.outputDir },
    });
    return {
      error: message,
      cached: false,
      ...(attempt.importingReport ? { incurredCost: 0 } : {}),
      ...(!attempt.importingReport && observedCost ? { cost: observedCost.estimatedUsd } : {}),
      ...(!attempt.importingReport && tokenUsage ? { tokenUsage } : {}),
      metadata: {
        codexSecurity: summary,
        codexSecurityReplay: createCodexSecurityReplayHeader(null, summary),
        ...(observers.progress ? { progress: observers.progress } : {}),
      },
    };
  }

  async checkSetup(
    context?: CallApiContextParams,
  ): Promise<Awaited<ReturnType<NonNullable<ApiProvider['checkSetup']>>>> {
    let client: CodexSecurity | undefined;
    const attempt = this.operationContext(context);
    attempt.phase = 'setup';
    try {
      // Without a row, never guess values for templated paths.
      if (!context && /\{[{%]/.test(this.config.report_file ?? JSON.stringify(this.config))) {
        throw new Error(
          'Use concrete configuration values for a local setup check. Test-case variables are resolved only during evaluation.',
        );
      }
      const config = this.resolveConfig(context);
      attempt.operation = config.operation ?? 'security-scan';
      attempt.reportFile = resolveConfigPath(config.report_file, config.basePath);
      if (attempt.reportFile) {
        const { summary } = await readCodexSecurityReport(attempt.reportFile);
        return {
          success: true,
          message:
            'Saved report format and scan IDs checked. No SDK or model call was run. The file hash identifies its contents; it does not authenticate the report.',
          details: { check: 'saved-report', source: summary.source },
        };
      }
      const environmentError = this.environmentError();
      if (environmentError) {
        throw new Error(environmentError);
      }
      const operation = attempt.operation;
      const repository = this.repository(config, context);
      const module = await loadCodexSecurity();
      attempt.sdkVersion = module.VERSION;
      client = this.createClient(module, config);
      this.activeClients.add(client);
      if (typeof client.preflight !== 'function') {
        throw new Error(
          'This SDK does not support local preflight. Update @openai/codex-security to check setup without running an operation.',
        );
      }
      const target =
        operation === 'validation'
          ? { target: 'repository' as const }
          : this.getScanTarget(module, operation, config);
      if ('error' in target) {
        throw new Error(target.error);
      }
      if (operation === 'validation' && config.finding_file) {
        const findingPath = resolveConfigPath(config.finding_file, config.basePath)!;
        if (!(await fs.stat(findingPath)).isFile()) {
          throw new Error('Finding file must be a regular file.');
        }
      }
      const options =
        operation === 'validation'
          ? {
              ...(config.output_dir
                ? { outputDir: resolveConfigPath(config.output_dir, config.basePath) }
                : {}),
              ...(config.auth ? { auth: config.auth } : {}),
            }
          : this.buildScanOptions(
              '',
              operation === 'deep-security-scan' ? 'deep' : 'standard',
              target.target,
              config,
              { warnings: [] },
            );
      const preflight = await client.preflight(repository, options);
      return {
        success: true,
        message:
          'Local configuration and paths checked. No scan or model call was run. Python/runtime readiness, credentials, account access, and model availability have not been verified.',
        details: {
          check: 'local-preflight',
          operation,
          sdkVersion: module.VERSION,
          repository: preflight.repository,
          model: preflight.model,
          reasoningEffort: preflight.reasoningEffort,
          authentication: preflight.authentication,
          outputDir: preflight.outputDir,
        },
      };
    } catch (error) {
      const message = `Local setup check failed: ${error instanceof Error ? error.message : String(error)}`;
      return {
        success: false,
        message,
        error: message,
        response: this.failureResponse(message, attempt),
      };
    } finally {
      if (client) {
        this.activeClients.delete(client);
        try {
          await client.close();
        } catch (error) {
          logger.warn('[CodexSecurity] Error while closing setup client', { error });
        }
      }
    }
  }

  async cleanup(): Promise<void> {
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
    const observers: ScanObservers = { warnings: [] };
    const attempt = this.operationContext(context);
    const startedAt = Date.now();
    let progressPhase = 'configuration';
    observers.notify = (phase) => {
      if (phase) {
        progressPhase = phase;
      }
      try {
        const estimate = observers.cost?.estimatedUsd;
        const notification = callOptions?.onProgress?.({
          phase: progressPhase,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          ...(typeof estimate === 'number' && Number.isFinite(estimate) && estimate >= 0
            ? { estimatedCostUsd: estimate }
            : {}),
          ...(observers.warnings.length > 0 ? { warningCount: observers.warnings.length } : {}),
        });
        void Promise.resolve(notification).catch(() => undefined);
      } catch {
        // A progress observer must never affect the operation or its recorded evidence.
      }
    };
    observers.notify();
    try {
      const config = this.resolveConfig(context);
      attempt.operation = config.operation ?? 'security-scan';
      attempt.reportFile = resolveConfigPath(config.report_file, config.basePath);
      if (callOptions?.abortSignal?.aborted) {
        throw new Error('Codex Security operation was aborted before it started.');
      }
      if (attempt.reportFile) {
        attempt.phase = 'import';
        observers.notify('import');
        const { raw, summary } = await readCodexSecurityReport(
          attempt.reportFile,
          callOptions?.abortSignal,
        );
        const unsuccessful = ['failed', 'canceled', 'interrupted'].includes(summary.status);
        return {
          ...(raw === null ? {} : { output: JSON.stringify(raw), raw, format: 'json' as const }),
          ...(unsuccessful
            ? { error: summary.error ?? `Recorded Codex Security operation ${summary.status}.` }
            : {}),
          cached: false,
          incurredCost: 0,
          metadata: {
            codexSecurity: summary,
            codexSecurityReplay: createCodexSecurityReplayHeader(
              raw as Record<string, unknown> | null,
              summary,
            ),
          },
        };
      }
      attempt.phase = 'setup';
      observers.notify('setup');
      const repository = this.repository(config, context);
      const environmentError = this.environmentError();
      if (environmentError) {
        throw new Error(environmentError);
      }
      const module = await loadCodexSecurity();
      attempt.sdkVersion = module.VERSION;
      const client = this.createClient(module, config);
      this.activeClients.add(client);
      try {
        if (attempt.operation === 'validation') {
          attempt.phase = 'validation';
          observers.notify('validation');
          const result = await this.runValidation(
            client,
            prompt,
            repository,
            config,
            context,
            callOptions,
          );
          const summary = normalizeCodexSecurityResult(result.raw, {
            source: { kind: 'sdk' },
            operation: attempt.operation,
            sdkVersion: attempt.sdkVersion,
            status: 'completed',
            diagnostics: { phase: 'validation', warningAvailability: 'unknown' },
          });
          return {
            ...result,
            metadata: {
              ...result.metadata,
              codexSecurity: summary,
              codexSecurityReplay: createCodexSecurityReplayHeader(
                result.raw as Record<string, unknown>,
                summary,
              ),
            },
          };
        }
        attempt.phase = 'scan';
        observers.notify('scan');
        return await this.runScan(
          client,
          module,
          prompt,
          repository,
          attempt.operation,
          config,
          observers,
          callOptions,
        );
      } finally {
        this.activeClients.delete(client);
        try {
          await client.close();
        } catch (error) {
          logger.warn('[CodexSecurity] Error while closing SDK client', { error });
        }
      }
    } catch (error) {
      const canceled = callOptions?.abortSignal?.aborted ?? false;
      const message = `Codex Security operation ${canceled ? 'canceled' : 'failed'}: ${error instanceof Error ? error.message : String(error)}`;
      return this.failureResponse(message, attempt, observers, canceled);
    }
  }

  private async runScan(
    client: CodexSecurity,
    module: CodexSecurityModule,
    prompt: string,
    repository: string,
    operation: 'security-scan' | 'deep-security-scan' | 'security-diff-scan',
    config: OpenAICodexSecurityConfig,
    observers: ScanObservers,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const mode = operation === 'deep-security-scan' ? 'deep' : 'standard';
    const targetResult = this.getScanTarget(module, operation, config);
    if ('error' in targetResult) {
      throw new Error(targetResult.error);
    }

    const options = this.buildScanOptions(
      prompt,
      mode,
      targetResult.target,
      config,
      observers,
      callOptions,
    );
    const result = await client.run(repository, options);
    return this.buildScanResponse(result, module, operation, observers);
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
      ...(config.output_dir
        ? { outputDir: resolveConfigPath(config.output_dir, config.basePath) }
        : {}),
      ...(config.archive_existing === undefined
        ? {}
        : { archiveExisting: config.archive_existing }),
      ...(config.knowledge_base_paths
        ? {
            knowledgeBasePaths: config.knowledge_base_paths.map(
              (knowledgePath) => resolveConfigPath(knowledgePath, config.basePath)!,
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
        observers.notify?.();
      },
      onProgress: (progress) => {
        observers.progress = progress;
        const phases = [
          'preflight',
          'threat_model',
          'discovery',
          'validation',
          'attack_path',
          'reporting',
        ];
        if (phases.includes(progress.phase)) {
          observers.notify?.(progress.phase);
        }
      },
      onWarning: (warning) => {
        observers.warnings.push(warning);
        observers.notify?.();
      },
      onOutputDirReady: (outputDir) => {
        observers.outputDir = outputDir;
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
    operation: 'security-scan' | 'deep-security-scan' | 'security-diff-scan',
    observers: ScanObservers,
  ): ProviderResponse {
    const cost = result.cost ?? observers.cost;
    const tokenUsage = getTokenUsage(result, observers.cost);
    const raw = result.toJSON();
    const summary = normalizeCodexSecurityResult(raw, {
      source: { kind: 'sdk' },
      operation,
      sdkVersion: module.VERSION,
      pluginVersion: result.pluginVersion,
      observedCost: cost,
      warnings: observers.warnings,
      diagnostics: { phase: 'scan', warningAvailability: 'unknown' },
      artifactPaths: {
        findingsPath: result.findingsPath,
        coveragePath: result.coveragePath,
        manifestPath: result.manifestPath,
      },
    });
    const unsuccessful = ['failed', 'canceled', 'interrupted'].includes(summary.status);

    return {
      output: JSON.stringify(raw),
      format: 'json',
      raw,
      cached: false,
      sessionId: result.threadId,
      ...(unsuccessful
        ? { error: summary.error ?? `Codex Security operation ${summary.status}.` }
        : {}),
      ...(cost ? { cost: cost.estimatedUsd } : {}),
      ...(tokenUsage ? { tokenUsage } : {}),
      metadata: {
        codexSecurity: summary,
        codexSecurityReplay: createCodexSecurityReplayHeader(
          raw as Record<string, unknown>,
          summary,
        ),
        ...(observers.progress ? { progress: observers.progress } : {}),
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
    // Finding precedence is config.finding, then context.vars.finding, then prompt.
    // finding_file overrides all three when it is configured.
    let finding: string | object = config.finding ?? contextualFinding ?? prompt;
    if (config.finding_file) {
      const findingContents = await fs.readFile(
        resolveConfigPath(config.finding_file, config.basePath)!,
        'utf8',
      );
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
      ...(config.output_dir
        ? { outputDir: resolveConfigPath(config.output_dir, config.basePath) }
        : {}),
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
        skillCalls: [{ name: 'validation' }],
      },
    };
  }
}
