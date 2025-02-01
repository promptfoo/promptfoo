import { z } from 'zod';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import type { EvaluateResult } from '../../types';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import { globalContext } from '../../util/globalContext';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

const CURRENT_VERSION = 1;
const StartResponseSchema = z.object({
  id: z.string(),
  iteration: z.number(),
  pendingPlugins: z.array(z.string()),
  version: z.number(),
});

/**
 * Response schema for /next and /success.
 * Returns testCases (which may be empty), run id, current iteration, and pending plugins.
 */
const NextResponseSchema = z.object({
  testCases: z
    .array(
      z.object({
        pluginId: z.string(),
        prompt: z.string(),
        program: z.string(),
      }),
    )
    .optional()
    .default([]),
  id: z.string(),
  iteration: z.number(),
  pendingPlugins: z.array(z.string()),
});

export default class RedteamPandamoniumProvider implements ApiProvider {
  private maxTurns: number;
  private readonly injectVar: string;
  private readonly stateful: boolean;
  private currentTurn: number;
  private baseUrl: string;

  log(message: string, level: 'error' | 'warn' | 'info' | 'debug') {
    logger[level](
      `[panda] ${this.currentTurn ? `[Iteration ${this.currentTurn}]` : ''} - ${message}`,
    );
  }

  id() {
    return 'promptfoo:redteam:pandamonium';
  }

  constructor(
    options: ProviderOptions & {
      maxTurns?: number;
      injectVar?: string;
      stateful?: boolean;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(`Pandamonium remote grading to be enabled`);
    }
    this.stateful = options.stateful ?? false;
    this.currentTurn = 0;
    this.baseUrl = 'http://localhost:3201/api/pandamonium';
    this.log(
      `Constructor options: ${JSON.stringify({
        injectVar: options.injectVar,
        maxTurns: options.maxTurns,
        stateful: options.stateful,
      })}`,
      'debug',
    );

    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.injectVar = options.injectVar;
    this.maxTurns = options.maxTurns || 1000;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (context == null) {
      throw Error('context is null');
    }

    const results: EvaluateResult[] = [];
    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');

    let runId: string | undefined = undefined;
    this.log(`Starting pandamonium, hold on tight`, 'info');

    const runEvalOptions = globalContext.getRunEvalOptions();
    invariant(runEvalOptions, 'Expected run eval options to be set');

    const testCases = runEvalOptions.reduce(
      (acc, t) => {
        const pluginId = t.test.metadata?.pluginId;
        invariant(t.test.vars, 'Expected test vars to be set');
        const injectVar = Object.keys(t.test.vars).find((k) => k != 'harmCateogry');
        if (!injectVar) {
          this.log(`No injectVar found for test ${JSON.stringify(t.test)}`, 'info');
          return acc;
        }

        if (!acc.some((tc) => tc.pluginId === pluginId)) {
          acc.push({
            pluginId,
            prompt: t.test.vars[injectVar] as string,
          });
        }
        return acc;
      },
      [] as { pluginId?: string; prompt: string }[],
    );

    // Start the run
    try {
      const startResponse = await fetch(`${this.baseUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases,
          email: getUserEmail(),
        }),
      });
      const startData = await startResponse.json();
      const parsedStartData = StartResponseSchema.parse(startData);
      if (parsedStartData.version !== CURRENT_VERSION) {
        throw new Error(`Your client is out of date. Please update to the latest version.`);
      }
      runId = parsedStartData.id;

      // Main iteration loop
      for (let turn = 0; turn < this.maxTurns; turn++) {
        this.currentTurn = turn;
        this.log(`Starting iteration ${turn}`, 'debug');

        // Get next iteration
        const nextResponse = await fetch(`${this.baseUrl}/next`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: runId,
            email: getUserEmail(),
          }),
        });

        const data = await nextResponse.json();
        const parsedData = NextResponseSchema.parse(data);

        if (!parsedData.testCases?.length) {
          this.log(`No test cases received, breaking`, 'info');
          break;
        }

        this.log(`Received ${data.testCases.length} test cases`, 'debug');

        // Call target with the test cases
        const result = await this.callTarget(parsedData.testCases, context, options);

        if (!result?.length) {
          this.log(`No result from target provider, continuing`, 'info');
          continue;
        }

        this.log(`Results from target: ${result.length}`, 'debug');
        results.push(...result.map((r) => r.result));

        // Check for successful jailbreak
        const successfulResult = result.find((r) => r.result.success);
        if (successfulResult) {
          this.log(
            `We got a successful jailbreak  after ${results.length} probes with program: ${successfulResult.program}`,
            'info',
          );

          // Report success
          await fetch(`${this.baseUrl}/success`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: runId,
              pluginId: successfulResult.pluginId,
              h4rm3lProgram: successfulResult.program,
              email: getUserEmail(),
            }),
          });
        }
      }
      const lastResult = results.pop();
      return {
        output: lastResult?.response?.output,
        metadata: lastResult?.response?.metadata ?? {},
        tokenUsage: lastResult?.response?.tokenUsage,
        guardrails: lastResult?.response?.guardrails,
        additionalResults: results,
      };
    } catch (err) {
      this.log(`Error during pandamonium run: ${err}`, 'error');
    }

    this.log(`Epic Panda fail, no jailbreak found after ${results.length} probes. :(`, 'info');
    const lastResult = results.pop();
    return {
      output: lastResult?.response?.output,
      metadata: lastResult?.response?.metadata ?? {},
      tokenUsage: lastResult?.response?.tokenUsage,
      guardrails: lastResult?.response?.guardrails,
      additionalResults: results,
    };
  }

  async callTarget(
    tests: { pluginId: string; prompt: string; program: string }[],
    context: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) {
    const { runEval } = await import('../../evaluator');
    const testForEval = { ...context?.test, provider: undefined };

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');
    const results: { result: EvaluateResult; program: string; pluginId: string }[] = [];
    let i = 0;
    for (const test of tests) {
      i++;
      this.log(`Sending prompt ${i} to target provider`, 'debug');

      const vars = { ...testForEval.vars, prompt: test.prompt };
      try {
        const evalResults = await runEval({
          provider: targetProvider,
          prompt: { raw: test.prompt, label: test.prompt },
          delay: 0,
          test: { ...testForEval, vars },
          testIdx: 1000 + i,
          promptIdx: 0,
          repeatIndex: 0,
          isRedteam: true,
        });
        const result = evalResults[0];
        if (result) {
          result.vars.prompt = test.prompt;
          result.testCase.vars = { ...result.testCase.vars, prompt: test.prompt };
        }

        results.push({ result, program: test.program, pluginId: test.pluginId });
      } catch (error) {
        this.log(
          `On test ${JSON.stringify(test)}: there was an error in the target provider: ${error}`,
          'info',
        );
      }
    }
    return results;
  }
}
