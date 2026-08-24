import { SpanStatusCode } from '@opentelemetry/api';
import { z } from 'zod';
import cliState from '../cliState';
import logger from '../logger';
import {
  emitTurnMarkerSpan,
  getGenAITracer,
  getTraceparent,
  withGenAISpan,
} from '../tracing/genaiTracer';
import {
  cacheResponse,
  getCachedResponse,
  initializeAgenticCache,
  resolveAgenticWorkingDir,
} from './agentic-utils';
import { providerRegistry } from './providerRegistry';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcpProviderConfig {
  /** Command to spawn the ACP agent (e.g. "kiro-cli acp", "codex-acp") */
  command?: string | string[];

  /** Working directory for the agent */
  working_dir?: string;

  /** Per-session timeout in seconds (default: 300) */
  timeout?: number;

  /** Model to request (passed via ACP set_config_option) */
  model?: string;

  /** Permission handling: auto_approve (default) or deny */
  permission_mode?: 'auto_approve' | 'deny';

  /** Extra environment variables for the agent subprocess */
  env?: Record<string, string>;

  /** Forward full process env to agent (default: false) */
  inherit_process_env?: boolean;

  /** Propagate OTEL TRACEPARENT into agent process (default: false) */
  deep_tracing?: boolean;
}

/** Represents a single tool call captured during an ACP session. */
export interface AcpToolCallEntry {
  id: string;
  name: string;
  input?: unknown;
  output?: unknown;
  is_error?: boolean;
}

// ---------------------------------------------------------------------------
// Config Validation
// ---------------------------------------------------------------------------

const AcpConfigSchema = z.object({
  command: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  working_dir: z.string().optional(),
  timeout: z.number().positive().optional(),
  model: z.string().optional(),
  permission_mode: z.enum(['auto_approve', 'deny']).optional(),
  env: z.record(z.string(), z.string()).optional(),
  inherit_process_env: z.boolean().optional(),
  deep_tracing: z.boolean().optional(),
});

function parseAcpConfig(config: AcpProviderConfig | undefined): AcpProviderConfig {
  if (!config) {
    throw new Error(
      "ACP provider requires a 'command' config option. " +
        'Example: command: ["kiro-cli", "acp"] or command: "codex-acp"',
    );
  }
  try {
    return AcpConfigSchema.parse(config) as AcpProviderConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => {
          const pathLabel = issue.path.length > 0 ? issue.path.join('.') : '(root)';
          return `${pathLabel}: ${issue.message}`;
        })
        .join('; ');
      throw new Error(`Invalid ACP provider config: ${issues}`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Provider Class
// ---------------------------------------------------------------------------

export class AcpProvider implements ApiProvider {
  public config: AcpProviderConfig;
  private providerId: string;

  constructor(options: { id?: string; config?: AcpProviderConfig; env?: EnvOverrides }) {
    this.config = parseAcpConfig(options.config);
    this.providerId = options.id || 'acp';
    providerRegistry.register(this);
  }

  id(): string {
    return this.providerId;
  }

  async cleanup(): Promise<void> {
    // Resources are cleaned up per-call (finally block kills subprocess).
    // No persistent state to tear down.
  }

  async shutdown(): Promise<void> {
    providerRegistry.unregister(this);
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Check abort signal early
    if (options?.abortSignal?.aborted) {
      return { output: '', error: 'ACP call aborted' };
    }
    // Resolve working directory
    const workingDir =
      resolveAgenticWorkingDir(this.config.working_dir, cliState.basePath) || process.cwd();

    // Check cache
    const cacheResult = await this.checkCache(prompt, workingDir);
    if (cacheResult) {
      return cacheResult;
    }

    // Wrap in GenAI span for tracing
    return withGenAISpan(
      {
        system: 'acp',
        operationName: 'invoke_agent',
        model: this.config.model || 'ACP',
        agentName: 'ACP',
        providerId: this.id(),
        traceparent: context?.traceparent,
        requestBody: prompt,
      },
      async (span) => {
        // Tag trace with the actual agent binary for filtering
        const cmd = this.resolveCommand();
        span.setAttribute('gen_ai.agent.binary', cmd.join(' '));

        const startTime = Date.now();

        let result: ProviderResponse;
        try {
          result = await this.executeAcp(prompt, workingDir, options?.abortSignal);
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          result = {
            output: '',
            error: `ACP provider error: ${error}`,
            metadata: { durationMs: Date.now() - startTime },
          };
        }

        // Enrich with timing
        if (result.metadata) {
          result.metadata.durationMs = result.metadata.durationMs || Date.now() - startTime;
        }

        // Emit tool spans
        this.emitToolSpans(result.metadata?.toolCalls || []);

        // Emit turn marker (single turn)
        const now = Date.now();
        emitTurnMarkerSpan({
          tracer: getGenAITracer(),
          index: 1,
          startTime: startTime,
          endTime: now,
          attributes: { 'gen_ai.turn.index': 1 },
          errorMessage: result.error,
          logLabel: 'ACP',
        });

        // Write cache
        if (!result.error) {
          await this.writeCache(prompt, workingDir, result);
        }

        return result;
      },
      (response) => ({
        tokenUsage: response.tokenUsage,
        responseId: response.sessionId,
        responseBody: typeof response.output === 'string' ? response.output : undefined,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // ACP Execution
  // ---------------------------------------------------------------------------
  private async executeAcp(
    prompt: string,
    workingDir: string,
    abortSignal?: AbortSignal,
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const timeout = (this.config.timeout || 300) * 1000;
    const command = this.resolveCommand();

    // Dynamically import the ACP SDK and child_process
    let acpSdk: any;
    try {
      // @ts-ignore - optional dependency, may not have type declarations
      acpSdk = await import('@agentclientprotocol/sdk');
    } catch {
      return {
        output: '',
        error:
          'The @agentclientprotocol/sdk package is required for the ACP provider. ' +
          'Install it with: npm install @agentclientprotocol/sdk',
      };
    }

    const { spawn } = await import('node:child_process');
    const { Writable, Readable } = await import('node:stream');

    // Build environment
    const agentEnv = this.buildEnv();

    // Collect results
    const allToolCalls: AcpToolCallEntry[] = [];

    let sessionId = '';
    let stopReason = '';
    let finalOutput = '';

    // Declare outside try so finally can kill it
    let agentProcess: ReturnType<typeof spawn> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    try {
      // Spawn the agent process
      agentProcess = spawn(command[0], command.slice(1), {
        stdio: ['pipe', 'pipe', 'ignore'],
        cwd: workingDir,
        env: agentEnv,
      });

      const input = Writable.toWeb(agentProcess.stdin!);
      const output = Readable.toWeb(agentProcess.stdout!);
      const stream = acpSdk.ndJsonStream(input, output);

      // Per-turn collectors
      const textChunks: string[] = [];
      const toolMap = new Map<string, AcpToolCallEntry>();

      // Build the client with handlers and connect
      const clientBuilder = acpSdk.client({ name: 'promptfoo-acp' });

      // Permission handler
      if (this.config.permission_mode === 'auto_approve') {
        clientBuilder.onRequest(acpSdk.methods.client.session.requestPermission, (ctx: any) => {
          const opts = ctx.params.options || [];
          const first =
            opts.find((o: any) => o.kind === 'allow_once' || o.kind === 'allow_always') || opts[0];
          return {
            outcome: { outcome: 'selected', optionId: first?.optionId || '' },
          };
        });
      } else {
        clientBuilder.onRequest(acpSdk.methods.client.session.requestPermission, () => ({
          outcome: { outcome: 'cancelled' },
        }));
      }

      // Session update notification handler
      clientBuilder.onNotification(acpSdk.methods.client.session.update, (ctx: any) => {
        const update = ctx.params.update;

        // Collect text
        if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
          textChunks.push(update.content.text);
        }

        // Collect tool calls
        if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
          const tcId = update.toolCallId || '';
          if (tcId) {
            let tc = toolMap.get(tcId);
            if (!tc) {
              tc = { id: tcId, name: '' };
              toolMap.set(tcId, tc);
            }
            if (update.title) {
              tc.name = update.title;
            }
            if (update.rawInput) {
              tc.input = update.rawInput;
            }
            if (update.rawOutput) {
              tc.output = update.rawOutput;
            }
            if (update.status === 'failed') {
              tc.is_error = true;
            }
          }
        }
      });

      // Connect and execute
      const promptResult = await Promise.race([
        clientBuilder.connectWith(stream, async (ctx: any) => {
          // Initialize
          await ctx.request(acpSdk.methods.agent.initialize, {
            protocolVersion: acpSdk.PROTOCOL_VERSION,
            clientCapabilities: {},
          });

          // Create session and run turns
          return ctx.buildSession(workingDir).withSession(async (session: any) => {
            sessionId = session.sessionId || '';

            // Set model if configured
            if (this.config.model) {
              try {
                await ctx.request(acpSdk.methods.agent.session.setConfigOption, {
                  sessionId,
                  configId: 'model',
                  value: this.config.model,
                });
              } catch (err) {
                logger.debug(`[ACP] Failed to set model: ${err}`);
              }
            }

            // Send prompt and collect response
            session.prompt(prompt);

            // Read updates until stop
            for (;;) {
              const message = await session.nextUpdate();
              if (message.kind === 'stop') {
                stopReason = message.response?.stopReason || '';
                break;
              }
            }

            finalOutput = textChunks.join('').trim();
            allToolCalls.push(...Array.from(toolMap.values()));

            return { stopReason };
          });
        }),
        new Promise<never>((_, reject) => {
          const err = new Error(`ACP session timed out after ${this.config.timeout || 300}s`);
          err.name = 'AcpTimeoutError';
          timeoutId = setTimeout(() => reject(err), timeout);
        }),
        ...(abortSignal
          ? [
              new Promise<never>((_, reject) => {
                abortHandler = () => {
                  const err = new Error('ACP call aborted');
                  err.name = 'AcpAbortError';
                  reject(err);
                };
                abortSignal.addEventListener('abort', abortHandler, { once: true });
              }),
            ]
          : []),
      ]);

      if (typeof promptResult === 'object' && promptResult !== null) {
        stopReason = (promptResult as any).stopReason || stopReason;
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      const errorName = err instanceof Error ? err.name : '';
      const isOurs = errorName === 'AcpTimeoutError' || errorName === 'AcpAbortError';
      const catchStopReason =
        errorName === 'AcpTimeoutError'
          ? 'timeout'
          : errorName === 'AcpAbortError'
            ? 'aborted'
            : 'error';
      return {
        output: finalOutput,
        error: isOurs ? error : `ACP execution failed: ${error}`,
        sessionId: sessionId || undefined,
        metadata: {
          sessionId,
          stopReason: catchStopReason,
          durationMs: Date.now() - startTime,
          toolCalls: allToolCalls,
        },
      };
    } finally {
      // Clean up resources to prevent leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortSignal && abortHandler) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
      if (agentProcess && !agentProcess.killed) {
        agentProcess.kill();
      }
    }

    return {
      output: finalOutput,
      sessionId: sessionId || undefined,
      metadata: {
        sessionId,
        stopReason,
        durationMs: Date.now() - startTime,
        toolCalls: allToolCalls,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private emitToolSpans(toolCalls: AcpToolCallEntry[]): void {
    try {
      const tracer = getGenAITracer();
      for (const tc of toolCalls) {
        const attributes: Record<string, string | number | boolean> = {
          'gen_ai.operation.name': 'execute_tool',
          'gen_ai.tool.name': tc.name || 'unknown',
          'tool.name': tc.name || 'unknown',
          'gen_ai.turn.index': 1,
        };
        if (tc.id) {
          attributes['gen_ai.tool.call.id'] = tc.id;
        }
        if (tc.input) {
          const input = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input);
          attributes['tool.input'] = input.slice(0, 4096);
        }
        if (tc.output) {
          const output = typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output);
          attributes['tool.output'] = output.slice(0, 4096);
        }
        if (tc.is_error) {
          attributes['tool.is_error'] = true;
        }

        const span = tracer.startSpan(`tool ${tc.name || 'unknown'}`, {
          startTime: Date.now(),
          attributes,
        });
        span.setStatus({
          code: tc.is_error ? SpanStatusCode.ERROR : SpanStatusCode.OK,
        });
        span.end();
      }
    } catch (err) {
      logger.debug(`[ACP] Failed to emit tool spans: ${err}`);
    }
  }

  private resolveCommand(): string[] {
    const cmd = this.config.command;
    if (!cmd) {
      throw new Error(
        "ACP provider requires a 'command' config option specifying the agent binary to spawn. " +
          'Example: command: ["kiro-cli", "acp"] or command: "codex-acp"',
      );
    }
    if (Array.isArray(cmd)) {
      return cmd;
    }
    // Split simple string command
    return cmd.split(/\s+/);
  }

  private buildEnv(): Record<string, string> {
    const base: Record<string, string> = {};

    if (this.config.inherit_process_env) {
      Object.assign(base, process.env);
    } else {
      // Minimal shell env
      for (const key of ['PATH', 'HOME', 'SHELL', 'USER', 'LANG', 'TERM', 'TMPDIR']) {
        if (process.env[key]) {
          base[key] = process.env[key]!;
        }
      }
    }

    // Apply provider-specific env
    if (this.config.env) {
      Object.assign(base, this.config.env);
    }

    // Propagate tracing if enabled
    if (this.config.deep_tracing) {
      const traceparent = getTraceparent();
      if (traceparent) {
        base['TRACEPARENT'] = traceparent;
      }
    }

    return Object.keys(base).length > 0 ? base : { PATH: process.env.PATH || '' };
  }

  // ---------------------------------------------------------------------------
  // Caching
  // ---------------------------------------------------------------------------

  private async checkCache(prompt: string, workingDir: string): Promise<ProviderResponse | null> {
    try {
      const cacheResult = await initializeAgenticCache(
        { cacheKeyPrefix: 'acp', workingDir },
        { prompt, config: this.config },
      );
      const cached = await getCachedResponse(cacheResult);
      if (cached) {
        return { ...cached, cached: true };
      }
      // Store cache result for write later
      this._lastCacheResult = cacheResult;
    } catch {
      // Cache miss or error, continue
    }
    return null;
  }

  private _lastCacheResult: any = null;

  private async writeCache(
    _prompt: string,
    _workingDir: string,
    response: ProviderResponse,
  ): Promise<void> {
    try {
      if (this._lastCacheResult) {
        await cacheResponse(this._lastCacheResult, response);
        this._lastCacheResult = null;
      }
    } catch {
      // Cache write failure is non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Factory (for registry)
// ---------------------------------------------------------------------------

export function createAcpProvider(
  providerPath: string,
  options: { id?: string; config?: AcpProviderConfig; env?: EnvOverrides },
): AcpProvider {
  return new AcpProvider({
    id: options.id || providerPath,
    config: options.config,
    env: options.env,
  });
}
