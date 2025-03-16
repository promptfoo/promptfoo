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

interface TestCasePayload {
  pluginId: string;
  prompts: { prompt: string; testIdx: number }[];
}

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

  /**
   * Bootstraps the pandamonium run:
   * 1. Prepares the test cases payload.
   * 2. Starts the run by calling the /start API.
   * 3. Iteratively gets new test cases, evaluates them via the target provider,
   *    and (if a jailbreak is found) reports the success.
   */
  async runPandamonium(
    targetProvider: ApiProvider,
    test: AtomicTestCase,
    allTests: RunEvalOptions[],
    concurrency: number = 4,
  ): Promise<EvaluateResult[]> {
    const results: EvaluateResult[] = [];
    this.currentTestIdx = Math.max(...allTests.map((t) => t.testIdx));
    this.log(`Starting pandamonium run, hold on tight`, 'info');

    // Create payload for the /start request.
    const testCasesPayload = this.prepareTestCases(allTests);

    try {
      // Start the run
      const startData = await this.startRun(testCasesPayload);
      if (startData.version !== CURRENT_VERSION) {
        throw new Error(`Your client is out of date. Please update to the latest version.`);
      }
      const runId = startData.id;

      // Main iteration loop
      for (let turn = 0; turn < this.maxTurns; turn++) {
        this.currentTurn = turn;
        this.log(`Starting iteration ${turn}`, 'debug');

        const nextData = await this.fetchNextIteration(runId);

        if (!nextData.testCases || nextData.testCases.length === 0) {
          this.log(`No more test cases received from the server, we're done!`, 'info');
          break;
        }
        this.log(
          `Got ${nextData.testCases.length} new probes. ${nextData.pendingPlugins.length} Plugins still to jailbreak: ${nextData.pendingPlugins.join(
            ', ',
          )}`,
          'info',
        );

        // Evaluate all test cases
        const evalResults = await this.evaluateTestCases(
          nextData.testCases,
          targetProvider,
          allTests,
          concurrency,
        );

        if (!evalResults || evalResults.length === 0) {
          this.log(`No results from target provider, continuing`, 'info');
          continue;
        }

        this.log(`Results from target: ${evalResults.length}`, 'debug');
        results.push(...evalResults.map((r) => r.result));

        // Check for a successful jailbreak
        const successfulResult = evalResults.find((r) => !r.result.success);
        if (successfulResult) {
          this.log(
            `We got a successful jailbreak after ${results.length} probes with program: ${successfulResult.program} - prompt: ${successfulResult.result.prompt.raw}`,
            'debug',
          );
          // Report success
          await this.reportSuccess(runId, successfulResult);
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

  /**
   * Extracts tests which are not part of another strategy and groups them by plugin.
   */
  private prepareTestCases(allTests: RunEvalOptions[]): TestCasePayload[] {
    return allTests.reduce((acc, t) => {
      if (t.test.metadata?.strategyId) {
        return acc;
      }
      const pluginId = t.test.metadata?.pluginId;
      invariant(t.test.vars, 'Expected test vars to be set');
      const injectVarName = Object.keys(t.test.vars).find((key) => key !== 'harmCateogry');
      if (!injectVarName) {
        this.log(`No injectVar found for test ${JSON.stringify(t.test)}`, 'error');
        return acc;
      }
      const prompt = t.test.vars[injectVarName] as string;
      const existing = acc.find((item) => item.pluginId === pluginId);
      if (existing) {
        existing.prompts.push({ prompt, testIdx: t.testIdx });
      } else {
        acc.push({ pluginId, prompts: [{ prompt, testIdx: t.testIdx }] });
      }
      return acc;
    }, [] as TestCasePayload[]);
  }

  /**
   * Calls the /start endpoint to kick off the pandamonium run.
   */
  private async startRun(
    testCases: TestCasePayload[],
  ): Promise<z.infer<typeof StartResponseSchema>> {
    const response = await fetchWithRetries(
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
    const data = await response.json();
    return StartResponseSchema.parse(data);
  }

  /**
   * Fetches iteration data by calling the /next endpoint.
   */
  private async fetchNextIteration(runId: string): Promise<z.infer<typeof NextResponseSchema>> {
    const response = await fetchWithRetries(
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
    const data = await response.json();
    return NextResponseSchema.parse(data);
  }

  /**
   * Evaluates multiple test cases using the target provider with limited concurrency.
   */
  private async evaluateTestCases(
    tests: PandamoniumTest[],
    targetProvider: ApiProvider,
    allTests: RunEvalOptions[],
    concurrency: number,
  ): Promise<Array<{ result: EvaluateResult; program: string; pluginId: string }>> {
    const results: Array<{ result: EvaluateResult; program: string; pluginId: string }> = [];
    let promptCounter = 0;

    await async.forEachOfLimit(tests, concurrency, async (test, _index) => {
      promptCounter++;
      this.log(`Sending prompt ${promptCounter}/${tests.length} to target provider`, 'debug');
      const evaluation = await this.evaluateSingleTest(test, targetProvider, allTests);
      if (evaluation) {
        results.push(evaluation);
      }
    });
    return results;
  }

  /**
   * Evaluates a single test case by:
   *   - Finding the originating test in the full list.
   *   - Building a deep-copied test with updated vars and metadata.
   *   - Using runEval (imported on demand) to execute the test.
   */
  private async evaluateSingleTest(
    test: PandamoniumTest,
    targetProvider: ApiProvider,
    allTests: RunEvalOptions[],
  ): Promise<{ result: EvaluateResult; program: string; pluginId: string } | null> {
    const originalTest = allTests.find((t) => t.testIdx === test.testIdx);
    if (!originalTest) {
      this.log(`Original test not found for testIdx ${test.testIdx}`, 'error');
      return null;
    }

    const vars = { ...originalTest.test.vars, prompt: test.prompt };
    // Deep copy the test to avoid mutating the original test and prevent circular references.
    const testForEval: AtomicTestCase = JSON.parse(JSON.stringify(originalTest.test));
    testForEval.provider = undefined;

    if (Array.isArray(testForEval.assert)) {
      testForEval.assert = testForEval.assert.map((a) => ({
        ...a,
        metric: `${a.metric}/Pandamonium`,
      }));
    }

    testForEval.metadata = {
      ...testForEval.metadata,
      strategyId: 'pandamonium',
    };

    try {
      const { runEval } = await import('../../evaluator');
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
      return { result, program: test.program, pluginId: test.pluginId };
    } catch (error) {
      this.log(`Error evaluating test ${JSON.stringify(test)}: ${error}`, 'info');
      return null;
    }
  }

  /**
   * Reports a successful jailbreak by calling the /success endpoint.
   */
  private async reportSuccess(
    runId: string,
    successfulResult: { result: EvaluateResult; program: string; pluginId: string },
  ): Promise<void> {
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
