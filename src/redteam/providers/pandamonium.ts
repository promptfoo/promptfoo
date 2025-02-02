import async from 'async';
import { z } from 'zod';
import { fetchWithRetries } from '../../fetch';
import { getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import type { AtomicTestCase, EvaluateResult, RunEvalOptions } from '../../types';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import invariant from '../../util/invariant';
import { neverGenerateRemote } from '../remoteGeneration';

const CURRENT_VERSION = 1;
const TIMEOUT = 120000;
const StartResponseSchema = z.object({
  id: z.string(),
  iteration: z.number(),
  pendingPlugins: z.array(z.string()),
  version: z.number(),
});

const PandamoniumTestSchema = z.object({
  pluginId: z.string(),
  prompt: z.string(),
  program: z.string(),
  testIdx: z.number(),
});

type PandamoniumTest = z.infer<typeof PandamoniumTestSchema>;

/**
 * Response schema for /next and /success.
 * Returns testCases (which may be empty), run id, current iteration, and pending plugins.
 */
const NextResponseSchema = z.object({
  testCases: z.array(PandamoniumTestSchema).optional().default([]),
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
  private currentTestIdx: number;
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
      throw new Error(`Remote generation is disabled. Pandamonium requires remote generation.`);
    }
    this.stateful = options.stateful ?? false;
    this.currentTurn = 0;
    this.baseUrl = cloudConfig.getApiHost() + '/api/pandamonium';
    this.currentTestIdx = 0;
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
    this.maxTurns = options.maxTurns || 500;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    throw new Error('Pandamonium is not a real provider. Call runPandamonium instead.');
  }

  async runPandamonium(
    targetProvider: ApiProvider,
    test: AtomicTestCase,
    allTests: RunEvalOptions[],
  ): Promise<EvaluateResult[]> {
    const results: EvaluateResult[] = [];
    this.currentTestIdx = Math.max(...allTests.map((t) => t.testIdx));
    let runId: string | undefined = undefined;
    this.log(`Starting pandamonium, hold on tight`, 'info');

    const testCases = allTests.reduce(
      (acc, t) => {
        if (t.test.metadata?.strategyId) {
          return acc;
        }
        const pluginId = t.test.metadata?.pluginId;
        invariant(t.test.vars, 'Expected test vars to be set');
        const injectVar = Object.keys(t.test.vars).find((k) => k != 'harmCateogry');
        if (!injectVar) {
          this.log(`No injectVar found for test ${JSON.stringify(t.test)}`, 'error');
          return acc;
        }

        if (acc.some((tc) => tc.pluginId === pluginId)) {
          acc
            .find((tc) => tc.pluginId === pluginId)
            ?.prompts.push({ prompt: t.test.vars[injectVar] as string, testIdx: t.testIdx });
        } else {
          acc.push({
            pluginId,
            prompts: [{ prompt: t.test.vars[injectVar] as string, testIdx: t.testIdx }],
          });
        }
        return acc;
      },
      [] as { pluginId?: string; prompts: { prompt: string; testIdx: number }[] }[],
    );

    // Start the run
    try {
      const startResponse = await fetchWithRetries(
        `${this.baseUrl}/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testCases,
            email: getUserEmail(),
          }),
        },
        TIMEOUT,
      );
      const startData = await startResponse.json();
      const parsedStartData = StartResponseSchema.parse(startData);
      if (parsedStartData.version !== CURRENT_VERSION) {
        throw new Error(`Your client is out of date. Please update to the latest version.`);
      }
      runId = parsedStartData.id;

      // Main iteration loop
      for (let turn = 0; turn < 2; turn++) {
        this.currentTurn = turn;
        this.log(`Starting iteration ${turn}`, 'debug');

        // Get next iteration
        const nextResponse = await fetchWithRetries(
          `${this.baseUrl}/next`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: runId,
              email: getUserEmail(),
            }),
          },
          TIMEOUT,
        );

        const data = await nextResponse.json();
        const parsedData = NextResponseSchema.parse(data);

        if (!parsedData.testCases?.length) {
          this.log(`No test cases received, breaking`, 'info');
          break;
        }

        this.log(`Received ${parsedData.testCases.length} test cases`, 'debug');
        this.log(
          `Got ${parsedData.testCases.length} new probes. ${parsedData.pendingPlugins.length} Plugins still to jailbreak: ${parsedData.pendingPlugins.join(', ')}`,
          'info',
        );
        // Call target with the test cases
        const result = await this.callTarget(parsedData.testCases, targetProvider, allTests);

        if (!result?.length) {
          this.log(`No result from target provider, continuing`, 'info');
          continue;
        }

        this.log(`Results from target: ${result.length}`, 'debug');
        results.push(...result.map((r) => r.result));

        // Check for successful jailbreak
        const successfulResult = result.find((r) => !r.result.success);
        if (successfulResult) {
          this.log(
            `We got a successful jailbreak  after ${results.length} probes with program: ${successfulResult.program} ${successfulResult.result.prompt} ${JSON.stringify(successfulResult.result.gradingResult)}`,
            'debug',
          );

          // Report success
          await fetchWithRetries(
            `${this.baseUrl}/success`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: runId,
                pluginId: successfulResult.pluginId,
                h4rm3lProgram: successfulResult.program,
                email: getUserEmail(),
              }),
            },
            TIMEOUT,
          );
        }
      }
      this.log(`Pandamonium run complete. ${results.length} probes were sent.`, 'info');
      return results;
    } catch (err) {
      this.log(`Error during pandamonium run: ${err}`, 'error');
    }

    this.log(`Epic Panda fail, no jailbreak found after ${results.length} probes. :(`, 'info');
    return results;
  }

  async callTarget(
    tests: PandamoniumTest[],
    targetProvider: ApiProvider,
    allTests: RunEvalOptions[],
  ) {
    const { runEval } = await import('../../evaluator');

    const results: { result: EvaluateResult; program: string; pluginId: string }[] = [];
    let i = 0;
    await async.forEachOfLimit(tests, 10, async (test, index) => {
      i++;
      this.log(`Sending prompt ${i} to target provider`, 'debug');
      const originalTest = allTests.find((t) => t.testIdx === test.testIdx);

      const vars = {
        ...originalTest?.test.vars,
        prompt: test.prompt,
      };
      const testForEval = {
        ...JSON.parse(JSON.stringify(originalTest?.test)),
        provider: undefined,
      };
      if (Array.isArray(testForEval.assert)) {
        testForEval.assert = [...testForEval.assert].map((a) => ({
          ...a,
          metric: `${a.metric}/Pandamonium`,
        }));
      }

      testForEval.metadata = {
        ...testForEval.metadata,
        strategyId: 'pandamonium',
      };
      try {
        const evalResults = await runEval({
          provider: targetProvider,
          prompt: { raw: test.prompt, label: test.prompt },
          delay: 0,
          test: { ...testForEval, vars },
          testIdx: this.currentTestIdx++,
          promptIdx: 0,
          repeatIndex: 0,
          isRedteam: true,
        });
        const result = evalResults[0];

        results.push({ result, program: test.program, pluginId: test.pluginId });
      } catch (error) {
        this.log(
          `On test ${JSON.stringify(test)}: there was an error in the target provider: ${error}`,
          'info',
        );
      }
    });
    return results;
  }
}
