import { VERSION } from '../../constants';
import { runEval } from '../../evaluator';
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
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

export default class RedteamPandamoniumProvider implements ApiProvider {
  private maxTurns: number;
  private readonly injectVar: string;
  private readonly stateful: boolean;
  private currentTurn: number;

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
    this.maxTurns = options.maxTurns || 5;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    let response: Response | undefined = undefined;

    if (context == null) {
      throw Error('context is null');
    }

    const results: EvaluateResult[] = [];

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');

    let pandaRunId: string | undefined = undefined;

    this.log(`Starting pandamonium, hold on tight`, 'info');

    for (let turn = 0; turn < this.maxTurns; turn++) {
      this.currentTurn = turn;
      this.log(`Starting iteration ${turn}`, 'debug');

      try {
        const body: string = JSON.stringify({
          prompt,
          id: pandaRunId,
          task: 'pandamonium',
          version: VERSION,
          email: getUserEmail(),
        });
        logger.debug(`Sending request to ${getRemoteGenerationUrl()}: ${body}`);
        response = await fetch(getRemoteGenerationUrl(), {
          body,
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        const data = await response.json();
        this.log(`Fetched probes from pandamonium: ${data.prompts.length}`, 'debug');

        const result = await this.callTarget(data.prompts, context, options);
        if (!result) {
          this.log(`No result from target provider, continuing`, 'info');
          continue;
        }
        this.log(`Results from target: ${JSON.stringify(result.length)}`, 'debug');
        results.push(...result);
        if (result?.some((r) => !r.success)) {
          this.log(`We got a succesful jailbreak after ${results.length} probes`, 'info');
          const lastResult = results.pop();
          return {
            output: lastResult?.response?.output,
            metadata: lastResult?.response?.metadata ?? {},
            tokenUsage: lastResult?.response?.tokenUsage,
            guardrails: lastResult?.response?.guardrails,
            additionalResults: results,
          };
        }
        pandaRunId = data.id;
      } catch (err) {
        this.log(`Error in turn ${turn}: ${err}. \n Continuing...`, 'error');
      }
    }
    delete context?.vars?.sessionId;

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
    prompts: string[],
    context: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) {
    const testForEval = { ...context?.test, provider: undefined };

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');
    const results: EvaluateResult[] = [];
    let i = 0;
    for (const prompt of prompts) {
      i++;
      this.log(`Sending prompt ${i} to target provider`, 'debug');

      const vars = { ...testForEval.vars, prompt };
      try {
        const evalResults = await runEval({
          provider: targetProvider,
          prompt: { raw: prompt, label: prompt },
          delay: 0,
          test: { ...testForEval, vars },
          testIdx: 1000 + i,
          promptIdx: 0,
          repeatIndex: 0,
          isRedteam: true,
        });
        const result = evalResults[0];
        if (result) {
          result.vars.prompt = prompt;
          result.testCase.vars = { ...result.testCase.vars, prompt };
        }

        results.push(result);
      } catch (error) {
        this.log(
          `On prompt ${prompt}: there was an error in the target provider: ${error}`,
          'info',
        );
      }
    }
    return results;
  }
}
