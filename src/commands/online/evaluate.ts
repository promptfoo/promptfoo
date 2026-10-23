import path from 'node:path';

import { evaluateWithSource } from '../../evaluate';
import { TestCaseSchema } from '../../types/index';
import { readConfig } from '../../util/config/load';
import { maybeLoadFromExternalFile } from '../../util/file';

import type { CapturedTurn } from './store';

/** Only an explicitly selected, trusted grading configuration can supply executable assertions. */
export async function loadOnlineConfig(configPath: string) {
  const config = await readConfig(path.resolve(configPath));
  const basePath = config.basePath ?? path.dirname(path.resolve(configPath));
  const defaultTest =
    typeof config.defaultTest === 'string' && config.defaultTest.startsWith('file://')
      ? await maybeLoadFromExternalFile(
          `file://${path.resolve(basePath, config.defaultTest.slice('file://'.length))}`,
        )
      : config.defaultTest;
  const grading = TestCaseSchema.pick({
    assert: true,
    options: true,
    threshold: true,
    vars: true,
  }).parse(defaultTest);
  if (!grading.assert?.length) {
    throw new Error('Online evals require at least one assertion in defaultTest.assert');
  }
  return {
    grading,
    env: config.env,
    description: config.description ?? 'Online Agent quality',
    basePath,
  };
}

export async function evaluateTurn(
  turn: CapturedTurn,
  id: string,
  config: Awaited<ReturnType<typeof loadOnlineConfig>>,
  reportDirectory: string,
  signal?: AbortSignal,
) {
  const result = await evaluateWithSource(
    {
      description: `${config.description} (${turn.agent})`,
      basePath: config.basePath,
      env: config.env,
      prompts: ['{{input}}'],
      // A captured-output provider also handles empty replies. It cannot re-run the Agent.
      providers: [
        { id: () => `online:${turn.agent}`, callApi: async () => ({ output: turn.output }) },
      ],
      tests: [
        {
          ...config.grading,
          vars: { ...config.grading.vars, input: turn.input },
          metadata: {
            online: true,
            onlineEventId: id,
            agent: turn.agent,
            sessionId: turn.sessionId,
            turnId: turn.turnId,
            capturedAt: turn.capturedAt,
          },
        },
      ],
      sharing: false,
      writeLatestResults: true,
      outputPath: [
        path.join(reportDirectory, `${id}.json`),
        path.join(reportDirectory, `${id}.html`),
      ],
    },
    { eventSource: 'cli', cache: false, maxConcurrency: 1, abortSignal: signal },
  );
  const summary = await result.toEvaluateSummary();
  return { evalId: result.id, stats: summary.stats };
}
