import fs from 'fs/promises';

import { getDb } from '../database/index';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import { hashPrompt } from '../prompts/utils';
import telemetry from '../telemetry';
import {
  type AtomicTestCase,
  type CompletedPrompt,
  type EvaluateResult,
  type GradingResult,
  type ProviderResponse,
  ResultFailureReason,
  type TokenUsage,
  type Vars,
} from '../types/index';
import { sha256 } from '../util/createHash';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';
import type { Command } from 'commander';

interface OpenAIEvalsJsonlRow {
  run_id: string;
  data_source_idx: number;
  item: Record<string, unknown>;
  sample?: Record<string, unknown>;
  grades: Record<string, number>;
  grader_samples?: Record<string, unknown>;
  passes?: Record<string, boolean>;
}

interface ParsedImportFile {
  evalData: any;
  source: 'promptfoo-json' | 'openai-evals-jsonl';
}

/**
 * Extract the eval ID from export data, checking both v3 (evalId) and legacy (id) formats.
 */
function extractEvalId(evalData: any): string | undefined {
  return evalData.evalId || evalData.id;
}

/**
 * Extract createdAt from export data, checking metadata and legacy locations.
 */
function extractCreatedAt(evalData: any): Date {
  // V3 exports store timestamp in metadata.evaluationCreatedAt
  if (evalData.metadata?.evaluationCreatedAt) {
    return new Date(evalData.metadata.evaluationCreatedAt);
  }
  // Also check results.timestamp as fallback
  if (evalData.results?.timestamp) {
    return new Date(evalData.results.timestamp);
  }
  // Legacy format may have createdAt at top level
  if (evalData.createdAt) {
    return new Date(evalData.createdAt);
  }
  // Default to now if no timestamp found
  return new Date();
}

/**
 * Extract author from export data, checking metadata and legacy locations.
 */
function extractAuthor(evalData: any): string | undefined {
  // V3 exports store author in metadata.author
  if (evalData.metadata?.author) {
    return evalData.metadata.author;
  }
  // Legacy format may have author at top level
  return evalData.author;
}

/**
 * Derive variable names from results for table display.
 */
function deriveVarsFromResults(results: any[]): string[] {
  const varSet = new Set<string>();
  for (const result of results) {
    if (result.vars && typeof result.vars === 'object') {
      for (const key of Object.keys(result.vars)) {
        varSet.add(key);
      }
    }
  }
  return Array.from(varSet);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isOpenAIEvalsJsonlRow(value: unknown): value is OpenAIEvalsJsonlRow {
  return (
    isRecord(value) &&
    typeof value.run_id === 'string' &&
    typeof value.data_source_idx === 'number' &&
    Number.isInteger(value.data_source_idx) &&
    value.data_source_idx >= 0 &&
    isRecord(value.item) &&
    (value.sample === undefined || isRecord(value.sample)) &&
    isNumberRecord(value.grades) &&
    (value.grader_samples === undefined || isRecord(value.grader_samples)) &&
    (value.passes === undefined || isBooleanRecord(value.passes))
  );
}

function createOpenAIItemVars(item: Record<string, unknown>): Vars {
  return { item };
}

function createOpenAIEvalsPrompt(runId: string, rows: OpenAIEvalsJsonlRow[]): CompletedPrompt {
  const hasStringInput = rows.every((row) => typeof row.item['input'] === 'string');
  const raw = hasStringInput ? '{{item.input}}' : 'Imported OpenAI eval item';
  const label = hasStringInput ? 'OpenAI eval item input' : 'Imported OpenAI eval item';

  return {
    raw,
    label,
    provider: `openai-evals:${runId}`,
  };
}

function getOpenAISampleError(sample: Record<string, unknown> | undefined): string | undefined {
  if (!sample) {
    return undefined;
  }

  if (typeof sample.error === 'string') {
    return sample.error;
  }

  if (isRecord(sample.error) && typeof sample.error.message === 'string') {
    return sample.error.message;
  }

  return undefined;
}

function getOpenAITokenUsage(sample: Record<string, unknown>): TokenUsage | undefined {
  if (!isRecord(sample.token_usage)) {
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

function getOpenAIOutput(sample: Record<string, unknown>): unknown {
  if (!Array.isArray(sample.outputs)) {
    return undefined;
  }

  if (sample.outputs.length === 1 && isRecord(sample.outputs[0])) {
    return sample.outputs[0].content ?? sample.outputs[0];
  }

  return sample.outputs;
}

function createOpenAIResponse(
  sample: Record<string, unknown> | undefined,
): ProviderResponse | undefined {
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
  pass: boolean | undefined,
  graderSample: unknown,
): GradingResult {
  const graderPassed = pass === true;
  return {
    pass: graderPassed,
    score: graderPassed ? 1 : 0,
    reason:
      grade === undefined
        ? `OpenAI grader "${graderName}" ${graderPassed ? 'passed' : 'failed'}.`
        : `OpenAI grader "${graderName}" ${graderPassed ? 'passed' : 'failed'} with grade ${grade}.`,
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
  const graderNames = Array.from(new Set([...Object.keys(row.grades), ...Object.keys(passes)]));
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
  const pass = totalCount > 0 && passedCount === totalCount;
  const failedNames = componentResults
    .filter((result) => !result.pass)
    .map((result) => result.metadata?.openaiGraderName)
    .filter((name): name is string => typeof name === 'string');

  return {
    pass,
    score: totalCount === 0 ? 0 : passedCount / totalCount,
    reason:
      totalCount === 0
        ? 'Imported OpenAI eval item did not include grader pass results.'
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
  const promptRaw =
    typeof row.item['input'] === 'string'
      ? row.item['input']
      : (JSON.stringify(row.item, null, 2) ?? '{}');
  const prompt = {
    raw: promptRaw,
    label: importedPrompt.label,
  };
  const testCase: AtomicTestCase = {
    description: `Imported OpenAI eval item ${row.data_source_idx}`,
    vars,
    metadata: {
      openaiRunId: row.run_id,
      openaiDataSourceIdx: row.data_source_idx,
    },
  };

  return {
    promptIdx,
    testIdx,
    testCase,
    promptId: hashPrompt(importedPrompt),
    provider: {
      id: importedPrompt.provider,
      label: `OpenAI Evals run ${row.run_id}`,
    },
    prompt,
    vars,
    ...(error === undefined ? {} : { error }),
    ...(response === undefined ? {} : { response }),
    failureReason:
      error === undefined
        ? gradingResult.pass
          ? ResultFailureReason.NONE
          : ResultFailureReason.ASSERT
        : ResultFailureReason.ERROR,
    success: gradingResult.pass,
    score: gradingResult.score,
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
        outputItem: row,
      },
    },
  };
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
    metrics.assertPassCount +=
      result.gradingResult?.componentResults?.filter((component) => component.pass).length ?? 0;
    metrics.assertFailCount +=
      result.gradingResult?.componentResults?.filter((component) => !component.pass).length ?? 0;
    accumulateResponseTokenUsage(metrics.tokenUsage, result.response);

    for (const [name, value] of Object.entries(result.namedScores)) {
      metrics.namedScores[name] = (metrics.namedScores[name] ?? 0) + value;
      metrics.namedScoresCount[name] = (metrics.namedScoresCount[name] ?? 0) + 1;
    }
  }

  return metrics;
}

function convertOpenAIEvalsJsonl(rows: OpenAIEvalsJsonlRow[]) {
  const runIds = Array.from(new Set(rows.map((row) => row.run_id)));
  if (runIds.length === 0) {
    throw new Error('OpenAI eval items JSONL import requires at least one row with a run_id.');
  }

  const promptIdxByRunId = new Map(runIds.map((runId, index) => [runId, index]));
  const importedPrompts = runIds.map((runId) =>
    createOpenAIEvalsPrompt(
      runId,
      rows.filter((row) => row.run_id === runId),
    ),
  );
  const firstRowByDataSourceIdx = new Map<number, OpenAIEvalsJsonlRow>();
  for (const row of rows) {
    if (!firstRowByDataSourceIdx.has(row.data_source_idx)) {
      firstRowByDataSourceIdx.set(row.data_source_idx, row);
    }
  }
  const testIdxByDataSourceIdx = new Map(
    Array.from(firstRowByDataSourceIdx.keys()).map((dataSourceIdx, index) => [
      dataSourceIdx,
      index,
    ]),
  );
  const results = rows.map((row) => {
    const promptIdx = promptIdxByRunId.get(row.run_id);
    const testIdx = testIdxByDataSourceIdx.get(row.data_source_idx);
    if (promptIdx === undefined || testIdx === undefined) {
      throw new Error('Failed to align imported OpenAI eval item.');
    }
    return createOpenAIResult(row, testIdx, promptIdx, importedPrompts[promptIdx]);
  });
  const completedPrompts = importedPrompts.map((importedPrompt, promptIdx) => ({
    ...importedPrompt,
    metrics: createOpenAIPromptMetrics(results.filter((result) => result.promptIdx === promptIdx)),
  }));
  const tests = Array.from(firstRowByDataSourceIdx.values()).map<AtomicTestCase>((row) => ({
    description: `Imported OpenAI eval item ${row.data_source_idx}`,
    vars: createOpenAIItemVars(row.item),
    metadata: {
      openaiRunId: row.run_id,
      openaiDataSourceIdx: row.data_source_idx,
    },
  }));
  const timestamp = new Date().toISOString();
  const evalId =
    runIds.length === 1
      ? `openai-evals-${runIds[0]}`
      : `openai-evals-runs-${sha256([...runIds].sort().join('\n')).slice(0, 24)}`;
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
          format: 'dashboard-output-items-jsonl',
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

function parseImportFile(fileContent: string): ParsedImportFile {
  try {
    const parsedJson = JSON.parse(fileContent);
    if (isOpenAIEvalsJsonlRow(parsedJson)) {
      return {
        evalData: convertOpenAIEvalsJsonl([parsedJson]),
        source: 'openai-evals-jsonl',
      };
    }
    if (
      Array.isArray(parsedJson) &&
      parsedJson.length > 0 &&
      parsedJson.every(isOpenAIEvalsJsonlRow)
    ) {
      return {
        evalData: convertOpenAIEvalsJsonl(parsedJson),
        source: 'openai-evals-jsonl',
      };
    }
    return {
      evalData: parsedJson,
      source: 'promptfoo-json',
    };
  } catch (jsonError) {
    const rows = fileContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rows.length > 0) {
      try {
        const parsedRows = rows.map((line) => JSON.parse(line));
        if (parsedRows.every(isOpenAIEvalsJsonlRow)) {
          return {
            evalData: convertOpenAIEvalsJsonl(parsedRows),
            source: 'openai-evals-jsonl',
          };
        }
      } catch {}
    }

    throw jsonError;
  }
}

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import a Promptfoo eval JSON export or an OpenAI Evals JSONL export')
    .option('--new-id', 'Generate a new eval ID instead of preserving the original')
    .option('--force', 'Replace existing eval with the same ID')
    .action(async (file, cmdObj) => {
      const db = getDb();
      let evalId: string;
      try {
        const fileContent = await fs.readFile(file, 'utf-8');
        const { evalData, source } = parseImportFile(fileContent);

        // Extract fields from correct locations (v3 export format)
        const importId = extractEvalId(evalData);
        const importCreatedAt = extractCreatedAt(evalData);
        const importAuthor = extractAuthor(evalData);

        // Check for collision if not forcing new ID
        if (importId && !cmdObj.newId) {
          const existing = await Eval.findById(importId);
          if (existing) {
            if (cmdObj.force) {
              logger.info(`Replacing existing eval ${importId}`);
              await existing.delete();
            } else {
              logger.error(
                `Eval ${importId} already exists. Use --new-id to import with a new ID, or --force to replace it.`,
              );
              process.exitCode = 1;
              return;
            }
          }
        }

        if (evalData.results.version === 3) {
          logger.debug('Importing v3 eval');

          // Derive vars from results for round-trip fidelity
          const vars = deriveVarsFromResults(evalData.results.results || []);

          const evalRecord = await Eval.create(evalData.config, evalData.results.prompts, {
            id: cmdObj.newId ? undefined : importId,
            createdAt: importCreatedAt,
            author: importAuthor,
            completedPrompts: evalData.results.prompts,
            vars,
          });
          await EvalResult.createManyFromEvaluateResult(evalData.results.results, evalRecord.id);
          evalId = evalRecord.id;
        } else {
          logger.debug('Importing v2 eval');
          evalId = cmdObj.newId
            ? createEvalId(importCreatedAt)
            : importId || createEvalId(importCreatedAt);
          await db
            .insert(evalsTable)
            .values({
              id: evalId,
              createdAt: importCreatedAt.getTime(),
              author: importAuthor,
              description: evalData.description || evalData.config?.description,
              results: evalData.results,
              config: evalData.config,
            })
            .run();
        }

        logger.info(`Eval with ID ${evalId} has been successfully imported.`);

        telemetry.record('command_used', {
          name: 'import',
          evalId,
          newId: cmdObj.newId || false,
          force: cmdObj.force || false,
          source,
        });
      } catch (error) {
        logger.error(`Failed to import eval: ${error}`);
        process.exitCode = 1;
      }
    });
}
