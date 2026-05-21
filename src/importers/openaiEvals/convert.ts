import logger from '../../logger';
import { hashPrompt } from '../../prompts/utils';
import {
  type AtomicTestCase,
  type CompletedPrompt,
  type EvaluateResult,
  type GradingResult,
  type ProviderResponse,
  ResultFailureReason,
  type TokenUsage,
  type Vars,
} from '../../types/index';
import { sha256 } from '../../util/createHash';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { isRecord } from './validation';

import type { OpenAIEvalsImportResult, OpenAIEvalsJsonlRow, OpenAISample } from './types';

const OPENAI_EVALS_PROVIDER_PREFIX = 'openai-evals';
const OPENAI_EVALS_IMPORT_FORMAT = 'dashboard-output-items-jsonl';

function createOpenAIItemVars(item: Record<string, unknown>): Vars {
  return { item };
}

function createOpenAIEvalsPrompt(runId: string, rows: OpenAIEvalsJsonlRow[]): CompletedPrompt {
  const hasStringInput = rows.every((row) => typeof row.item['input'] === 'string');
  const raw = hasStringInput ? '{{item.input}}' : 'Imported OpenAI eval item';
  const label = hasStringInput
    ? `OpenAI eval item input (${runId})`
    : `Imported OpenAI eval item (${runId})`;

  return {
    raw,
    label,
    provider: `${OPENAI_EVALS_PROVIDER_PREFIX}:${runId}`,
  };
}

function createOpenAITestCase(row: OpenAIEvalsJsonlRow): AtomicTestCase {
  return {
    description: `Imported OpenAI eval item ${row.data_source_idx}`,
    vars: createOpenAIItemVars(row.item),
    metadata: {
      openaiRunId: row.run_id,
      openaiDataSourceIdx: row.data_source_idx,
    },
  };
}

function getOpenAIFailureReason(error: string | undefined, success: boolean): ResultFailureReason {
  if (error !== undefined) {
    return ResultFailureReason.ERROR;
  }
  return success ? ResultFailureReason.NONE : ResultFailureReason.ASSERT;
}

function getOpenAISampleError(sample: OpenAISample | undefined): string | undefined {
  if (!sample) {
    return undefined;
  }

  if (typeof sample.error === 'string') {
    return sample.error;
  }

  if (isRecord(sample.error) && typeof sample.error.message === 'string') {
    return sample.error.message;
  }

  if (sample.error !== undefined) {
    logger.debug(
      `[openaiEvals] Unrecognized sample.error shape; preserving raw value: ${JSON.stringify(sample.error)}`,
    );
    return JSON.stringify(sample.error);
  }

  return undefined;
}

function getOpenAITokenUsage(sample: OpenAISample): TokenUsage | undefined {
  if (sample.token_usage === undefined) {
    return undefined;
  }
  if (!isRecord(sample.token_usage)) {
    logger.debug(
      `[openaiEvals] Dropping non-record token_usage: ${JSON.stringify(sample.token_usage)}`,
    );
    return undefined;
  }

  const total = sample.token_usage.total_tokens;
  const prompt = sample.token_usage.prompt_tokens;
  const completion = sample.token_usage.completion_tokens;
  const cached = sample.token_usage.cached_tokens;

  if (
    typeof total !== 'number' ||
    typeof prompt !== 'number' ||
    typeof completion !== 'number' ||
    (cached !== undefined && typeof cached !== 'number')
  ) {
    logger.debug(
      `[openaiEvals] Dropping malformed token_usage (non-numeric field): ${JSON.stringify(sample.token_usage)}`,
    );
    return undefined;
  }

  return {
    total,
    prompt,
    completion,
    cached: cached ?? 0,
    numRequests: 1,
  };
}

function getOpenAIOutput(sample: OpenAISample): unknown {
  if (sample.outputs === undefined) {
    return undefined;
  }
  if (!Array.isArray(sample.outputs)) {
    logger.debug(`[openaiEvals] Dropping non-array outputs: ${JSON.stringify(sample.outputs)}`);
    return undefined;
  }

  if (sample.outputs.length === 1 && isRecord(sample.outputs[0])) {
    return sample.outputs[0].content ?? sample.outputs[0];
  }

  return sample.outputs;
}

function createOpenAIResponse(sample: OpenAISample | undefined): ProviderResponse | undefined {
  if (!sample) {
    return undefined;
  }

  const output = getOpenAIOutput(sample);
  const error = getOpenAISampleError(sample);
  const tokenUsage = getOpenAITokenUsage(sample);

  return {
    ...(output === undefined ? {} : { output }),
    ...(error === undefined ? {} : { error }),
    ...(typeof sample.finish_reason === 'string' ? { finishReason: sample.finish_reason } : {}),
    ...(tokenUsage === undefined ? {} : { tokenUsage }),
    raw: sample,
  };
}

function createOpenAIComponentResult(
  graderName: string,
  grade: number | undefined,
  pass: boolean,
  graderSample: unknown,
): GradingResult {
  return {
    pass,
    score: pass ? 1 : 0,
    reason:
      grade === undefined
        ? `OpenAI grader "${graderName}" ${pass ? 'passed' : 'failed'}.`
        : `OpenAI grader "${graderName}" ${pass ? 'passed' : 'failed'} with grade ${grade}.`,
    namedScores: grade === undefined ? undefined : { [graderName]: grade },
    metadata: {
      openaiGraderName: graderName,
      openaiGrade: grade,
      openaiPass: pass,
      ...(graderSample === undefined ? {} : { openaiGraderSample: graderSample }),
    },
  };
}

function createOpenAIGradingResult(row: OpenAIEvalsJsonlRow): GradingResult {
  const passes = row.passes ?? {};
  const graderNames = Object.keys(passes);
  const componentResults = graderNames.map((graderName) =>
    createOpenAIComponentResult(
      graderName,
      row.grades[graderName],
      passes[graderName],
      row.grader_samples?.[graderName],
    ),
  );
  const passedCount = componentResults.filter((result) => result.pass).length;
  const totalCount = componentResults.length;
  const pass = totalCount === 0 || passedCount === totalCount;
  const failedNames = componentResults
    .filter((result) => !result.pass)
    .map((result) => result.metadata?.openaiGraderName)
    .filter((name): name is string => typeof name === 'string');

  return {
    pass,
    score: totalCount === 0 ? 1 : passedCount / totalCount,
    reason:
      totalCount === 0
        ? 'Imported OpenAI eval item did not include grader pass results; grader scores are preserved as named scores.'
        : pass
          ? 'All imported OpenAI eval graders passed.'
          : `Imported OpenAI eval graders failed: ${failedNames.join(', ')}.`,
    namedScores: row.grades,
    componentResults,
    metadata: {
      openaiRunId: row.run_id,
      openaiDataSourceIdx: row.data_source_idx,
    },
  };
}

function createOpenAIResult(
  row: OpenAIEvalsJsonlRow,
  testIdx: number,
  promptIdx: number,
  importedPrompt: CompletedPrompt,
): EvaluateResult {
  const vars = createOpenAIItemVars(row.item);
  const gradingResult = createOpenAIGradingResult(row);
  const response = createOpenAIResponse(row.sample);
  const error = getOpenAISampleError(row.sample);
  const success = error === undefined && gradingResult.pass;
  const promptRaw =
    typeof row.item['input'] === 'string' ? row.item['input'] : JSON.stringify(row.item, null, 2)!;
  const prompt = {
    raw: promptRaw,
    label: importedPrompt.label,
  };

  return {
    promptIdx,
    testIdx,
    testCase: createOpenAITestCase(row),
    promptId: hashPrompt(importedPrompt),
    provider: {
      id: importedPrompt.provider,
      label: `OpenAI Evals run ${row.run_id}`,
    },
    prompt,
    vars,
    ...(error === undefined ? {} : { error }),
    ...(response === undefined ? {} : { response }),
    failureReason: getOpenAIFailureReason(error, success),
    success,
    score: error === undefined ? gradingResult.score : 0,
    latencyMs: 0,
    gradingResult,
    namedScores: row.grades,
    metadata: {
      openai: {
        runId: row.run_id,
        dataSourceIdx: row.data_source_idx,
        item: row.item,
        ...(row.sample === undefined ? {} : { sample: row.sample }),
        grades: row.grades,
        passes: row.passes ?? {},
        graderSamples: row.grader_samples ?? {},
        // Intentional duplicate: stash the raw row so unknown future fields aren't dropped on import.
        outputItem: row,
      },
    },
  };
}

function canonicalizeOpenAIItem(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeOpenAIItem);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeOpenAIItem(value[key])]),
  );
}

function getOpenAIItemAlignmentKey(row: OpenAIEvalsJsonlRow): string {
  const itemHash = sha256(JSON.stringify(canonicalizeOpenAIItem(row.item)));
  return `${row.data_source_idx}:${itemHash}`;
}

function sanitizeOpenAIEvalsIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

function createOpenAIPromptMetrics(results: EvaluateResult[]): CompletedPrompt['metrics'] {
  const metrics: NonNullable<CompletedPrompt['metrics']> = {
    score: 0,
    testPassCount: 0,
    testFailCount: 0,
    testErrorCount: 0,
    assertPassCount: 0,
    assertFailCount: 0,
    totalLatencyMs: 0,
    tokenUsage: createEmptyTokenUsage(),
    namedScores: {},
    namedScoresCount: {},
    namedScoreWeights: {},
    cost: 0,
  };

  for (const result of results) {
    metrics.score += result.score;
    if (result.success) {
      metrics.testPassCount += 1;
    } else if (result.failureReason === ResultFailureReason.ERROR) {
      metrics.testErrorCount += 1;
    } else {
      metrics.testFailCount += 1;
    }
    for (const component of result.gradingResult?.componentResults ?? []) {
      if (component.pass) {
        metrics.assertPassCount += 1;
      } else {
        metrics.assertFailCount += 1;
      }
    }
    accumulateResponseTokenUsage(metrics.tokenUsage, result.response);

    for (const [name, value] of Object.entries(result.namedScores)) {
      metrics.namedScores[name] = (metrics.namedScores[name] ?? 0) + value;
      metrics.namedScoresCount[name] = (metrics.namedScoresCount[name] ?? 0) + 1;
    }
  }

  return metrics;
}

export function convertOpenAIEvalsJsonl(rows: OpenAIEvalsJsonlRow[]): OpenAIEvalsImportResult {
  if (rows.length === 0) {
    throw new Error('OpenAI eval items JSONL import requires at least one row.');
  }

  const runIds: string[] = [];
  const promptIdxByRunId = new Map<string, number>();
  const rowsByRunId = new Map<string, OpenAIEvalsJsonlRow[]>();
  const firstRowByAlignmentKey = new Map<string, OpenAIEvalsJsonlRow>();
  const testIdxByAlignmentKey = new Map<string, number>();
  const alignmentKeyByRow: string[] = new Array(rows.length);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!promptIdxByRunId.has(row.run_id)) {
      promptIdxByRunId.set(row.run_id, runIds.length);
      runIds.push(row.run_id);
      rowsByRunId.set(row.run_id, []);
    }
    rowsByRunId.get(row.run_id)!.push(row);

    const alignmentKey = getOpenAIItemAlignmentKey(row);
    alignmentKeyByRow[i] = alignmentKey;
    if (!firstRowByAlignmentKey.has(alignmentKey)) {
      testIdxByAlignmentKey.set(alignmentKey, firstRowByAlignmentKey.size);
      firstRowByAlignmentKey.set(alignmentKey, row);
    }
  }

  const importedPrompts = runIds.map((runId) =>
    createOpenAIEvalsPrompt(runId, rowsByRunId.get(runId)!),
  );
  const resultsByPromptIdx: EvaluateResult[][] = runIds.map(() => []);
  const results = rows.map((row, i) => {
    const promptIdx = promptIdxByRunId.get(row.run_id)!;
    const testIdx = testIdxByAlignmentKey.get(alignmentKeyByRow[i])!;
    const result = createOpenAIResult(row, testIdx, promptIdx, importedPrompts[promptIdx]);
    resultsByPromptIdx[promptIdx].push(result);
    return result;
  });
  const completedPrompts = importedPrompts.map((importedPrompt, promptIdx) => ({
    ...importedPrompt,
    metrics: createOpenAIPromptMetrics(resultsByPromptIdx[promptIdx]),
  }));
  const tests = Array.from(firstRowByAlignmentKey.values()).map(createOpenAITestCase);
  const timestamp = new Date().toISOString();
  const evalId =
    runIds.length === 1
      ? `${OPENAI_EVALS_PROVIDER_PREFIX}-${sanitizeOpenAIEvalsIdPart(runIds[0])}`
      : `${OPENAI_EVALS_PROVIDER_PREFIX}-runs-${sha256([...runIds].sort().join('\n')).slice(0, 24)}`;
  const runDescription = runIds.length === 1 ? `run ${runIds[0]}` : `runs ${runIds.join(', ')}`;

  return {
    evalId,
    results: {
      version: 3,
      timestamp,
      prompts: completedPrompts,
      results,
    },
    config: {
      description: `Imported from OpenAI Evals ${runDescription}`,
      tests,
      metadata: {
        openaiEvalsImport: {
          format: OPENAI_EVALS_IMPORT_FORMAT,
          rowCount: rows.length,
          runIds,
        },
      },
    },
    metadata: {
      evaluationCreatedAt: timestamp,
      openaiRunIds: runIds,
    },
  };
}
