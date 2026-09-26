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
import type {
  CodexSecurity,
  JsonObject,
  ScanCost,
  ScanOptions,
  ScanResult,
  ValidationOptions,
} from '@openai/codex-security';

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

  async checkSetup(): Promise<Awaited<ReturnType<NonNullable<ApiProvider['checkSetup']>>>> {
    let client: CodexSecurity | undefined;
    try {
      const config = this.config;
      const environmentError = this.environmentError();
      if (environmentError) {
        return { success: false, message: environmentError, error: environmentError };
      }
      // There is no eval row during setup. Never guess values for templated paths.
      if (/\{[{%]/.test(JSON.stringify(config))) {
        return {
          success: false,
          message:
            'Use concrete configuration values for a local setup check. Test-case variables are resolved only during evaluation.',
        };
      }
      const operation = config.operation ?? 'security-scan';
      const repository =
        resolveConfigPath(config.repository ?? config.working_dir, config.basePath) ??
        process.cwd();
      const module = await loadCodexSecurity();
      client = this.createClient(module, config);
      this.activeClients.add(client);
      if (typeof client.preflight !== 'function') {
        return {
          success: false,
          message:
            'This SDK does not support local preflight. Update @openai/codex-security to check setup without running an operation.',
        };
      }
      const target =
        operation === 'validation'
          ? { target: 'repository' as const }
          : this.getScanTarget(module, operation, config);
      if ('error' in target) {
        return { success: false, message: target.error, error: target.error };
      }
      if (operation === 'validation' && config.finding_file) {
        const findingPath = resolveConfigPath(config.finding_file, config.basePath)!;
        if (!(await fs.stat(findingPath)).isFile()) {
          return { success: false, message: 'Finding file must be a regular file.' };
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
      return { success: false, message, error: message };
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
    let sdkVersion: string | undefined;
    let operation = this.config.operation ?? 'security-scan';

    try {
      const mergedConfig = { ...this.config, ...context?.prompt?.config };
      delete mergedConfig.provider;
      const config = parseConfig(renderVarsInObject(mergedConfig, context?.vars), {
        stripUnknownKeys: true,
      });
      operation = config.operation ?? 'security-scan';
      const repositoryVariable = context?.vars?.repository;
      const configuredRepository =
        config.repository ??
        config.working_dir ??
        (typeof repositoryVariable === 'string' ? repositoryVariable : undefined);
      const repository = resolveConfigPath(configuredRepository, config.basePath) ?? process.cwd();

      if (callOptions?.abortSignal?.aborted) {
        return {
          error: 'Codex Security operation was aborted before it started.',
          metadata: { providerType: 'codex-security', operation, status: 'error' },
        };
      }

      const environmentError = this.environmentError();
      if (environmentError) {
        return {
          error: environmentError,
          metadata: { providerType: 'codex-security', operation, status: 'error' },
        };
      }

      const module = await loadCodexSecurity();
      sdkVersion = module.VERSION;
      const client = this.createClient(module, config);
      this.activeClients.add(client);

      try {
        if (operation === 'validation') {
          const result = await this.runValidation(
            client,
            prompt,
            repository,
            config,
            context,
            callOptions,
          );
          return {
            ...result,
            metadata: { ...result.metadata, providerType: 'codex-security', sdkVersion },
          };
        }

        const result = await this.runScan(
          client,
          module,
          prompt,
          repository,
          operation,
          config,
          observers,
          callOptions,
        );
        return {
          ...result,
          metadata: {
            ...result.metadata,
            providerType: 'codex-security',
            operation,
            sdkVersion,
            ...(result.error ? { status: 'error' } : {}),
          },
        };
      } finally {
        this.activeClients.delete(client);
        try {
          await client.close();
        } catch (error) {
          logger.warn('[CodexSecurity] Error while closing SDK client', { error });
        }
      }
    } catch (error) {
      const observedCost = observers.cost;
      const tokenUsage = observedCost ? getTokenUsage(undefined, observedCost) : undefined;

      return {
        error: `Codex Security operation failed: ${error instanceof Error ? error.message : String(error)}`,
        ...(observedCost ? { cost: observedCost.estimatedUsd } : {}),
        ...(tokenUsage ? { tokenUsage } : {}),
        metadata: {
          providerType: 'codex-security',
          operation,
          status: 'error',
          ...(sdkVersion ? { sdkVersion } : {}),
          ...(observedCost ? { cost: observedCost } : {}),
          ...(observers.outputDir ? { scanDir: observers.outputDir } : {}),
          ...(observers.progress ? { progress: observers.progress } : {}),
          ...(observers.warnings.length > 0 ? { warnings: observers.warnings } : {}),
        },
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
    observers: ScanObservers,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const mode = operation === 'deep-security-scan' ? 'deep' : 'standard';
    const targetResult = this.getScanTarget(module, operation, config);
    if ('error' in targetResult) {
      return targetResult;
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
      },
      onProgress: (progress) => {
        observers.progress = progress;
      },
      onWarning: (warning) => {
        observers.warnings.push(warning);
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
    repository: string,
    operation: 'security-scan' | 'deep-security-scan' | 'security-diff-scan',
    mode: 'standard' | 'deep',
    config: OpenAICodexSecurityConfig,
    observers: ScanObservers,
  ): ProviderResponse {
    const cost = result.cost ?? observers.cost;
    const tokenUsage = getTokenUsage(result, observers.cost);
    const findings = Array.isArray(result.findings?.findings) ? result.findings.findings : [];
    const model = result.turnResult?.model ?? cost?.model ?? config.model;
    const raw = result.toJSON();

    return {
      output: JSON.stringify(raw),
      format: 'json',
      raw,
      cached: false,
      sessionId: result.threadId,
      ...(cost ? { cost: cost.estimatedUsd } : {}),
      ...(tokenUsage ? { tokenUsage } : {}),
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
        ...(cost ? { cost } : {}),
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
        operation: 'validation',
        repository,
        disposition: result.disposition,
        outputDir: result.outputDir,
        ...(config.model ? { model: config.model } : {}),
        skillCalls: [{ name: 'validation' }],
      },
    };
  }
}
