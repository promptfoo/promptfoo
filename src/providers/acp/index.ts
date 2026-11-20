import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';
import cliState from '../../cliState';
import { getProcessEnv } from '../../envars';
import { renderVarsInObject } from '../../util/render';
import { resolveAgenticWorkingDir } from '../agentic-utils';
import { getMinimalProcessEnv } from '../agentProcessEnv';
import { resolveAcpPreset } from './presets';
import { runAcpTurn } from './session';
import { withAcpStdio } from './stdio';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';

const configSchema = z.strictObject({
  provider: z.unknown().optional(),
  linkedTargetId: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  pass_env: z.array(z.string().min(1)).optional(),
  basePath: z.string().optional(),
  working_dir: z.string().min(1).optional(),
  copy_working_dir: z.union([z.boolean(), z.enum(['copy', 'git'])]).optional(),
  auth_method: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  timeout_ms: z.number().int().positive().max(2_147_483_647).default(120_000),
});

export class AcpProvider implements ApiProvider {
  readonly handlesOwnRetries = true;
  readonly config: z.infer<typeof configSchema>;
  private readonly preset;
  private readonly command: string;

  constructor(
    private providerPath: string,
    private options: ProviderOptions = {},
  ) {
    this.preset = resolveAcpPreset(providerPath);
    this.config = configSchema.parse(options.config ?? {});
    const command = this.config.command ?? this.preset?.command;
    if (!command) {
      throw new Error('The acp provider requires config.command or a named acp:<preset>.');
    }
    this.command = /[/\\]/.test(command)
      ? path.resolve(this.config.basePath || cliState.basePath || '.', command)
      : command;
  }

  id() {
    return this.options.id ?? this.providerPath;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const deadline = AbortSignal.timeout(this.config.timeout_ms);
    const signal = options?.abortSignal
      ? AbortSignal.any([options.abortSignal, deadline])
      : deadline;
    let temporaryWorkspace: string | undefined;
    try {
      signal.throwIfAborted();
      const row = context?.prompt.config;
      // Only session settings may vary by row. The launch command and environment are trusted provider configuration.
      const settings = renderVarsInObject(
        {
          working_dir: row?.working_dir ?? this.config.working_dir,
          mode: row?.mode ?? this.config.mode,
          model: row?.model ?? this.config.model,
        },
        context?.vars,
      );
      const workingDir = resolveAgenticWorkingDir(
        settings.working_dir,
        this.config.basePath ?? cliState.basePath,
      );
      const cwd = workingDir ?? (await mkdtemp(path.join(os.tmpdir(), 'promptfoo-acp-')));
      if (!workingDir) {
        temporaryWorkspace = cwd;
      }
      const env = getMinimalProcessEnv();
      const processEnv = getProcessEnv();
      for (const key of [...(this.preset?.envKeys ?? []), ...(this.config.pass_env ?? [])]) {
        const value = this.options.env?.[key] ?? processEnv[key];
        if (value !== undefined) {
          env[key] = value;
        }
      }
      return await withAcpStdio(
        {
          command: this.command,
          args: this.config.args ?? this.preset?.args ?? [],
          cwd,
          env,
        },
        (stream) =>
          runAcpTurn(stream, {
            prompt,
            cwd,
            signal,
            authMethod: this.config.auth_method,
            mode: settings.mode,
            model: settings.model,
          }),
      );
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      if (deadline.aborted) {
        return { error: `ACP agent timed out after ${this.config.timeout_ms} ms` };
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          error: `Could not start ${this.command}. Install the agent and check config.command and working_dir.`,
        };
      }
      return {
        error: `ACP agent failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      if (temporaryWorkspace) {
        await rm(temporaryWorkspace, { recursive: true, force: true, maxRetries: 3 });
      }
    }
  }
}
