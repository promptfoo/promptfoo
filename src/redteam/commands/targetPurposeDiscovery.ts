/**
 * Target Purpose Discovery — probes a target to learn its purpose, limitations, and tools.
 *
 * Used by the OSS web UI and server routes. Extracted from the old `discover` CLI command.
 */

import { randomUUID } from 'crypto';

import cliProgress from 'cli-progress';
import { z } from 'zod';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { HttpProvider } from '../../providers/http';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl } from '../remoteGeneration';

import type { ApiProvider, Prompt } from '../../types/index';

// ========================================================
// Schemas
// ========================================================

const TargetPurposeDiscoveryStateSchema = z.object({
  currentQuestionIndex: z.number(),
  answers: z.array(z.any()),
});

export const TargetPurposeDiscoveryRequestSchema = z.object({
  state: TargetPurposeDiscoveryStateSchema,
  task: z.literal('target-purpose-discovery'),
  version: z.string(),
  email: z.string().optional().nullable(),
});

const TargetPurposeDiscoveryResultSchema = z.object({
  purpose: z.string().nullable(),
  limitations: z.string().nullable(),
  user: z.string().nullable(),
  tools: z.array(
    z
      .object({
        name: z.string(),
        description: z.string(),
        arguments: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            type: z.string(),
          }),
        ),
      })
      .nullable(),
  ),
});

export const TargetPurposeDiscoveryTaskResponseSchema = z.object({
  done: z.boolean(),
  question: z.string().optional(),
  purpose: TargetPurposeDiscoveryResultSchema.optional(),
  state: TargetPurposeDiscoveryStateSchema,
  error: z.string().optional(),
});

// ========================================================
// Types
// ========================================================

export type TargetPurposeDiscoveryResult = z.infer<typeof TargetPurposeDiscoveryResultSchema>;

// ========================================================
// Constants
// ========================================================

const DEFAULT_TURN_COUNT = 5;
const MAX_TURN_COUNT = 10;
const LOG_PREFIX = '[Target Discovery Agent]';

// ========================================================
// Utils
// ========================================================

const isNullLike = (value: string | null | undefined): boolean => {
  return !value || value === 'null' || value.trim() === '';
};

const cleanTools = (tools: Array<any> | null | undefined): Array<any> => {
  if (!tools || !Array.isArray(tools)) {
    return [];
  }
  return tools.filter((tool) => tool !== null && typeof tool === 'object');
};

export function normalizeTargetPurposeDiscoveryResult(
  result: TargetPurposeDiscoveryResult,
): TargetPurposeDiscoveryResult {
  return {
    purpose: isNullLike(result.purpose) ? null : result.purpose,
    limitations: isNullLike(result.limitations) ? null : result.limitations,
    user: isNullLike(result.user) ? null : result.user,
    tools: cleanTools(result.tools),
  };
}

/**
 * Queries Cloud for the purpose-discovery logic, sends each question to the target,
 * and summarizes the results.
 */
export async function doTargetPurposeDiscovery(
  target: ApiProvider,
  prompt?: Prompt,
  showProgress: boolean = true,
): Promise<TargetPurposeDiscoveryResult | undefined> {
  const sessionId = randomUUID();

  let pbar: cliProgress.SingleBar | undefined;
  if (showProgress) {
    pbar = new cliProgress.SingleBar({
      format: `Mapping the target {bar} {percentage}% | {value}${DEFAULT_TURN_COUNT ? '/{total}' : ''} turns`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      gracefulExit: true,
    });

    pbar.start(DEFAULT_TURN_COUNT, 0);
  }

  let done = false;
  let question: string | undefined;
  let discoveryResult: TargetPurposeDiscoveryResult | undefined;
  let state = TargetPurposeDiscoveryStateSchema.parse({
    currentQuestionIndex: 0,
    answers: [],
  });
  let turn = 0;

  while (!done && turn < MAX_TURN_COUNT) {
    try {
      turn++;

      logger.debug(`${LOG_PREFIX} Discovery loop turn: ${turn}`);

      const response = await fetchWithProxy(getRemoteGenerationUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloudConfig.getApiKey()}`,
        },
        body: JSON.stringify(
          TargetPurposeDiscoveryRequestSchema.parse({
            state: {
              currentQuestionIndex: state.currentQuestionIndex,
              answers: state.answers,
            },
            task: 'target-purpose-discovery',
            version: VERSION,
            email: getUserEmail(),
          }),
        ),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`${LOG_PREFIX} Error getting the next question from remote server: ${error}`);
        continue;
      }

      const responseData = await response.json();
      const data = TargetPurposeDiscoveryTaskResponseSchema.parse(responseData);

      logger.debug(
        `${LOG_PREFIX} Received response from remote server: ${JSON.stringify(data, null, 2)}`,
      );

      done = data.done;
      question = data.question;
      discoveryResult = data.purpose;
      state = data.state;

      if (data.error) {
        const errorMessage = `Error from remote server: ${data.error}`;
        logger.error(`${LOG_PREFIX} ${errorMessage}`);
        throw new Error(errorMessage);
      } else if (!done) {
        invariant(question, 'Question should always be defined if `done` is falsy.');

        const renderedPrompt = prompt
          ? await renderPrompt(prompt, { prompt: question }, {}, target)
          : question;

        const targetResponse = await target.callApi(renderedPrompt, {
          prompt: { raw: question, label: 'Target Discovery Question' },
          vars: { sessionId },
          bustCache: true,
        });

        if (targetResponse.error) {
          const errorMessage = `Error from target: ${targetResponse.error}`;
          logger.error(`${LOG_PREFIX} ${errorMessage}`);
          throw new Error(errorMessage);
        }

        if (turn > MAX_TURN_COUNT) {
          const errorMessage = `Too many retries, giving up.`;
          logger.error(`${LOG_PREFIX} ${errorMessage}`);
          throw new Error(errorMessage);
        }

        logger.debug(
          `${LOG_PREFIX} Received response from target: ${JSON.stringify(targetResponse, null, 2)}`,
        );

        if (
          target instanceof HttpProvider &&
          target.config.transformResponse === undefined &&
          typeof targetResponse.output === 'object' &&
          targetResponse.output !== null
        ) {
          logger.warn(
            `${LOG_PREFIX} Target response is an object; should a \`transformResponse\` function be defined?`,
          );
        }

        state.answers.push(targetResponse.output);
      }
    } finally {
      if (showProgress) {
        pbar?.increment(1);
      }
    }
  }
  if (showProgress) {
    pbar?.stop();
  }

  return discoveryResult ? normalizeTargetPurposeDiscoveryResult(discoveryResult) : undefined;
}
