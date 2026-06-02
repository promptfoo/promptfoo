import { randomUUID } from 'crypto';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import dedent from 'dedent';
import { XMLBuilder } from 'fast-xml-parser';
import yaml from 'js-yaml';
import { collectBlobHashes } from '../blobs/blobRefs';
import { BLOB_MAX_SIZE } from '../blobs/constants';
import { VERSION } from '../constants';
import { getEnvBool } from '../envars';
import { getDirectory } from '../esm';
import { writeCsvToGoogleSheet } from '../googleSheets';
import logger from '../logger';
import {
  asEvaluateResult,
  getResultIndexKey,
  sanitizeResultForJsonlArtifact,
} from '../models/evalResult';
import { streamEvalCsv } from '../server/utils/evalTableUtils';
import { PromptfooAttributes } from '../tracing/genaiTracer';
import {
  type CsvRow,
  type ExportedBlobAsset,
  type OutputFile,
  ResultFailureReason,
} from '../types';
import invariant from './invariant';
import { writeJunitXmlOutput } from './junit';
import { getOutputFileFormat, SUPPORTED_OUTPUT_FILE_FORMATS } from './outputFormats';
import { sanitizeObject, sanitizeRuntimeOptions } from './sanitizer';
import { getNunjucksEngine } from './templates';

import type Eval from '../models/eval';
import type { EvaluateResult, EvaluateTableOutput } from '../types';

export interface OutputOptions {
  includeMedia?: boolean;
}

// Every output path is always finalized post-run now (JSONL included), so nothing is
// filtered. This only emits a heads-up when a row failed to persist, so operators know the
// JSONL artifact was reconciled from the streamed rows and the eval record (the degraded
// recovery path in `writeOutput`) rather than rebuilt cleanly from the database.
export function warnOnDegradedJsonlRecovery(evalRecord: Eval, outputPaths: string[]): void {
  if (!evalRecord.resultPersistenceFailed) {
    return;
  }

  if (outputPaths.some((outputPath) => getOutputFileFormat(outputPath) === 'jsonl')) {
    logger.warn(
      '[Output] Reconciling JSONL from streamed rows and the eval record because one or more rows failed to persist',
    );
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function isPermissionDeniedError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'EACCES' || error.code === 'EPERM')
  );
}

async function resolveJsonlOutputPath(outputPath: string): Promise<string> {
  try {
    const stats = await fsPromises.lstat(outputPath);
    if (!stats.isSymbolicLink()) {
      return outputPath;
    }

    try {
      return await fsPromises.realpath(outputPath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return path.resolve(path.dirname(outputPath), await fsPromises.readlink(outputPath));
      }
      throw error;
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return outputPath;
    }
    throw error;
  }
}

async function appendJsonlResultBatch(outputPath: string, results: EvaluateResult[]) {
  if (results.length === 0) {
    return;
  }

  const text =
    results.map((result) => JSON.stringify(sanitizeResultForJsonlArtifact(result))).join(os.EOL) +
    os.EOL;
  await fsPromises.appendFile(outputPath, text);
}

async function readStreamedJsonlResults(outputPath: string): Promise<EvaluateResult[]> {
  let contents: string;
  try {
    contents = await fsPromises.readFile(outputPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  // Parse each line defensively. This recovery path exists precisely for runs that were
  // interrupted (crash / kill / partial flush), so the streamed file may end in a
  // truncated row. Skipping a malformed line — rather than aborting the whole
  // finalization — keeps the recoverable rows; the eval record and `getFinalJsonlResults()`
  // backfill the rest in `collectJsonlResultsAfterPersistenceFailure`.
  const results: EvaluateResult[] = [];
  const lines = contents.split(/\r?\n/).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    try {
      results.push(JSON.parse(line) as EvaluateResult);
    } catch (error) {
      logger.warn(
        `[Output] Skipping malformed streamed JSONL row at ${outputPath}:${index + 1} during recovery: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return results;
}

// Rebuild the JSONL rows after a mid-run persistence failure by merging three sources,
// keyed by `testIdx:promptIdx` with later sources winning:
//   1. the rows already streamed to disk (the base, including any that failed to persist),
//   2. the canonical database rows (skipping keys that failed to persist — the DB copy is
//      missing or stale for those), then
//   3. the in-memory final rows captured after the failure (timeout / deferred-grading
//      updates that never streamed), which are authoritative.
async function collectJsonlResultsAfterPersistenceFailure(outputPath: string, evalRecord: Eval) {
  const finalResults = new Map<string, EvaluateResult>();
  const put = (result: EvaluateResult) => finalResults.set(getResultIndexKey(result), result);

  for (const result of await readStreamedJsonlResults(outputPath)) {
    put(result);
  }
  for await (const batchResults of evalRecord.fetchResultsBatched()) {
    for (const result of batchResults) {
      const evaluateResult = asEvaluateResult(result);
      if (!evalRecord.hasResultPersistenceFailure(evaluateResult)) {
        put(evaluateResult);
      }
    }
  }
  for (const result of evalRecord.getFinalJsonlResults()) {
    put(result);
  }
  return Array.from(finalResults.values());
}

async function getExistingFileMode(outputPath: string): Promise<number | undefined> {
  try {
    return (await fsPromises.stat(outputPath)).mode & 0o7777;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function appendJsonlResults(
  outputPath: string,
  evalRecord: Eval,
  recoveredResults?: EvaluateResult[],
): Promise<void> {
  if (recoveredResults) {
    await appendJsonlResultBatch(outputPath, recoveredResults);
    return;
  }

  for await (const batchResults of evalRecord.fetchResultsBatched()) {
    await appendJsonlResultBatch(outputPath, batchResults.map(asEvaluateResult));
  }
}

async function rewriteJsonlWithExternalBackup(
  outputPath: string,
  outputMode: number | undefined,
  evalRecord: Eval,
  preparedReplacementPath?: string,
  recoveredResults?: EvaluateResult[],
): Promise<void> {
  const tempDirectory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'promptfoo-jsonl-'));
  const backupPath = path.join(tempDirectory, 'backup.jsonl');
  const replacementPath = path.join(tempDirectory, 'replacement.jsonl');
  let overwriteAttempted = false;
  let preserveTempDirectory = false;
  let hasBackup = false;

  try {
    try {
      await fsPromises.copyFile(outputPath, backupPath);
      hasBackup = true;
    } catch (error) {
      // First-time write (no existing artifact): there is nothing to back up. Proceed so the
      // replacement copy below surfaces the real permission error (EACCES/EPERM) from the
      // unwritable destination directory, rather than masking it with this secondary ENOENT.
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }
    if (preparedReplacementPath) {
      await fsPromises.copyFile(preparedReplacementPath, replacementPath);
    } else {
      if (outputMode === undefined) {
        await fsPromises.writeFile(replacementPath, '');
      } else {
        await fsPromises.writeFile(replacementPath, '', { mode: outputMode });
      }
      await appendJsonlResults(replacementPath, evalRecord, recoveredResults);
    }
    overwriteAttempted = true;
    await fsPromises.copyFile(replacementPath, outputPath);
    if (outputMode !== undefined) {
      await fsPromises.chmod(outputPath, outputMode);
    }
  } catch (error) {
    if (overwriteAttempted && hasBackup) {
      try {
        await fsPromises.copyFile(backupPath, outputPath);
      } catch (restoreError) {
        preserveTempDirectory = true;
        logger.error('[Output] Failed to restore JSONL output after rewrite failure', {
          backupPath,
          error: restoreError,
        });
        throw new Error(
          `Failed to rewrite JSONL output (${error instanceof Error ? error.message : String(error)}) and restore backup (${restoreError instanceof Error ? restoreError.message : String(restoreError)}). Backup retained at ${backupPath}`,
        );
      }
    }
    throw error;
  } finally {
    if (!preserveTempDirectory) {
      await fsPromises.rm(tempDirectory, { recursive: true, force: true }).catch((error) => {
        logger.warn('[Output] Failed to remove temporary JSONL backup directory', {
          error,
          tempDirectory,
        });
      });
    }
  }
}

async function removeTemporaryJsonlOutput(tempOutputPath: string): Promise<void> {
  await fsPromises.rm(tempOutputPath, { force: true }).catch((error) => {
    logger.warn('[Output] Failed to remove temporary JSONL output', {
      error,
      tempOutputPath,
    });
  });
}

const outputToSimpleString = (output: EvaluateTableOutput) => {
  const passFailText = output.pass
    ? '[PASS]'
    : output.failureReason === ResultFailureReason.ASSERT
      ? '[FAIL]'
      : '[ERROR]';
  const namedScoresText = Object.entries(output.namedScores)
    .map(([name, value]) => `${name}: ${value?.toFixed(2)}`)
    .join(', ');
  const scoreText =
    namedScoresText.length > 0
      ? `(${output.score?.toFixed(2)}, ${namedScoresText})`
      : `(${output.score?.toFixed(2)})`;
  const gradingResultText = output.gradingResult
    ? `${output.pass ? 'Pass' : 'Fail'} Reason: ${output.gradingResult.reason}`
    : '';
  return dedent`
      ${passFailText} ${scoreText}

      ${output.text}

      ${gradingResultText}
    `.trim();
};

const outputToHtmlReportCell = (output: EvaluateTableOutput) => {
  const status = output.pass
    ? 'pass'
    : output.failureReason === ResultFailureReason.ERROR
      ? 'error'
      : 'fail';
  const namedScores = Object.entries(output.namedScores).map(([name, value]) => ({
    name,
    value: value?.toFixed(2),
  }));

  return {
    status,
    statusLabel: status.toUpperCase(),
    score: output.score?.toFixed(2),
    namedScores,
    text: output.text,
    reason: output.gradingResult?.reason || '',
    prompt: output.prompt,
    provider: output.provider || '',
    error: output.error || '',
    failureReason: output.failureReason,
    latencyDisplay: Number.isFinite(output.latencyMs) ? `${output.latencyMs.toFixed(0)} ms` : '',
    costDisplay:
      Number.isFinite(output.cost) && output.cost > 0 ? `$${output.cost.toFixed(6)}` : '',
    totalTokensDisplay:
      typeof output.tokenUsage?.total === 'number'
        ? output.tokenUsage.total.toLocaleString('en-US')
        : '',
    promptTokensDisplay:
      typeof output.tokenUsage?.prompt === 'number'
        ? output.tokenUsage.prompt.toLocaleString('en-US')
        : '',
    completionTokensDisplay:
      typeof output.tokenUsage?.completion === 'number'
        ? output.tokenUsage.completion.toLocaleString('en-US')
        : '',
  };
};

function sanitizeConfigForOutput(config: Eval['config']): OutputFile['config'] {
  return sanitizeObject(config, {
    context: 'output config',
    throwOnError: true,
    maxDepth: Number.POSITIVE_INFINITY,
  }) as OutputFile['config'];
}

function projectTracesForOutput(traces: NonNullable<OutputFile['traces']>) {
  const shouldStripMetadata = getEnvBool('PROMPTFOO_STRIP_METADATA', false);
  const shouldStripPromptText = getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false);
  const shouldStripResponseOutput = getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false);
  const shouldStripTestVars = getEnvBool('PROMPTFOO_STRIP_TEST_VARS', false);

  if (
    !shouldStripMetadata &&
    !shouldStripPromptText &&
    !shouldStripResponseOutput &&
    !shouldStripTestVars
  ) {
    return traces;
  }

  return traces.map((trace) => {
    let projectedTrace = trace;
    if (shouldStripMetadata) {
      const { metadata: _metadata, ...traceWithoutMetadata } = trace;
      projectedTrace = traceWithoutMetadata;
    } else if (shouldStripTestVars && trace.metadata && 'vars' in trace.metadata) {
      const { metadata: traceMetadata, ...traceWithoutMetadata } = trace;
      const { vars: _vars, ...metadata } = traceMetadata;
      projectedTrace = {
        ...traceWithoutMetadata,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };
    }

    if (!shouldStripPromptText && !shouldStripResponseOutput) {
      return projectedTrace;
    }

    return {
      ...projectedTrace,
      spans: projectedTrace.spans.map((span) => {
        if (!span.attributes) {
          return span;
        }

        const projectedAttributes = { ...span.attributes };
        if (shouldStripPromptText) {
          delete projectedAttributes[PromptfooAttributes.REQUEST_BODY];
        }
        if (shouldStripResponseOutput) {
          delete projectedAttributes[PromptfooAttributes.RESPONSE_BODY];
        }

        const { attributes: _attributes, ...projectedSpan } = span;
        return {
          ...projectedSpan,
          ...(Object.keys(projectedAttributes).length > 0 && {
            attributes: projectedAttributes,
          }),
        };
      }),
    };
  });
}

function resultsForMediaExportScan(results: OutputFile['results']): unknown {
  if (!getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false)) {
    return results;
  }

  return {
    ...results,
    results: results.results.map((result) => {
      const response = (result as { response?: { metadata?: Record<string, unknown> } }).response;
      if (!response?.metadata || !('blobUris' in response.metadata)) {
        return result;
      }

      const { metadata: responseMetadata, ...projectedResponse } = response;
      const { blobUris: _blobUris, ...metadata } = responseMetadata;
      return {
        ...result,
        response: {
          ...projectedResponse,
          ...(Object.keys(metadata).length > 0 && { metadata }),
        },
      };
    }),
  };
}

export function createOutputMetadata(evalRecord: Eval) {
  let evaluationCreatedAt: string | undefined;
  if (evalRecord.createdAt) {
    try {
      const date = new Date(evalRecord.createdAt);
      evaluationCreatedAt = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    } catch {
      evaluationCreatedAt = undefined;
    }
  }

  return {
    promptfooVersion: VERSION,
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    exportedAt: new Date().toISOString(),
    evaluationCreatedAt,
    author: evalRecord.author ?? undefined,
  };
}

export async function createOutputData(
  evalRecord: Eval,
  shareableUrl: string | null,
  options: OutputOptions = {},
): Promise<OutputFile> {
  const summary = await evalRecord.toEvaluateSummary();
  const redactedConfig = sanitizeConfigForOutput(evalRecord.config);
  let traces;
  try {
    // TraceStore redacts sensitive attribute keys on reads by default.
    const { getTraceStore } = await import('../tracing/store');
    traces = await getTraceStore().getTracesByEvaluation(evalRecord.id);
  } catch (error) {
    logger.warn(
      `Failed to fetch traces for output ${evalRecord.id}; traces omitted from export: ${error}`,
    );
  }

  const output: OutputFile = {
    evalId: evalRecord.id,
    results: summary,
    config: redactedConfig,
    shareableUrl,
    metadata: createOutputMetadata(evalRecord),
    ...(evalRecord.vars?.length > 0 && { vars: [...evalRecord.vars] }),
    ...(evalRecord.runtimeOptions && {
      runtimeOptions: sanitizeRuntimeOptions(evalRecord.runtimeOptions),
    }),
    ...(traces && traces.length > 0 && { traces: projectTracesForOutput(traces) }),
  };

  if (options.includeMedia) {
    const blobAssets = await exportBlobAssets(summary, output.traces);
    if (blobAssets.length > 0) {
      output.blobAssets = blobAssets;
    }
  }

  return output;
}

async function exportBlobAssets(
  results: OutputFile['results'],
  traces?: OutputFile['traces'],
): Promise<ExportedBlobAsset[]> {
  const { getBlobByHash } = await import('../blobs');
  const assets: ExportedBlobAsset[] = [];
  for (const hash of collectBlobHashes({ results: resultsForMediaExportScan(results), traces })) {
    try {
      const blob = await getBlobByHash(hash);
      if (blob.data.length > BLOB_MAX_SIZE) {
        logger.warn('[Output] Skipping oversized blob in eval export', {
          hash,
          sizeBytes: blob.data.length,
        });
        continue;
      }
      assets.push({
        hash,
        mimeType: blob.metadata.mimeType,
        sizeBytes: blob.data.length,
        data: blob.data.toString('base64'),
      });
    } catch (error) {
      logger.warn('[Output] Skipping missing blob in eval export', {
        error,
        hash,
      });
    }
  }
  return assets;
}

/**
 * JSON writer with improved error handling for large datasets.
 * Provides helpful error messages when memory limits are exceeded.
 */
async function writeJsonOutputSafely(
  outputPath: string,
  evalRecord: Eval,
  shareableUrl: string | null,
  options: OutputOptions,
): Promise<void> {
  try {
    const outputData = await createOutputData(evalRecord, shareableUrl, options);

    // Use standard JSON.stringify with proper formatting
    const jsonString = JSON.stringify(outputData, null, 2);
    await fsPromises.writeFile(outputPath, jsonString);
  } catch (error) {
    const msg = (error as Error)?.message ?? '';
    const isStringLen = error instanceof RangeError && msg.includes('Invalid string length');
    const isHeapOOM = /heap out of memory|Array buffer allocation failed|ERR_STRING_TOO_LONG/i.test(
      msg,
    );
    if (isStringLen || isHeapOOM) {
      // The dataset is too large to load into memory at once
      const resultCount = await evalRecord.getResultsCount();
      logger.error(`Dataset too large for JSON export (${resultCount} results).`);
      throw new Error(
        `Dataset too large for JSON export. The evaluation has ${resultCount} results which exceeds memory limits. ` +
          'Consider using JSONL format instead: --output output.jsonl',
      );
    } else {
      throw error;
    }
  }
}

export async function writeOutput(
  outputPath: string,
  evalRecord: Eval,
  shareableUrl: string | null,
  options: OutputOptions = {},
) {
  if (outputPath.match(/^https:\/\/docs\.google\.com\/spreadsheets\//)) {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const rows = table.body.map((row) => {
      const csvRow: CsvRow = {};
      table.head.vars.forEach((varName, index) => {
        csvRow[varName] = row.vars[index];
      });
      table.head.prompts.forEach((prompt, index) => {
        csvRow[`[${prompt.provider}] ${prompt.label}`] = outputToSimpleString(row.outputs[index]);
      });
      return csvRow;
    });
    logger.info(`Writing ${rows.length} rows to Google Sheets...`);
    await writeCsvToGoogleSheet(rows, outputPath);
    return;
  }

  const outputExtension = getOutputFileFormat(outputPath);
  invariant(
    outputExtension,
    `Unsupported output file format ${path.extname(outputPath).slice(1).toLowerCase()}. Please use one of: ${SUPPORTED_OUTPUT_FILE_FORMATS.join(', ')}.`,
  );

  // Ensure the directory exists (mkdir with recursive is idempotent)
  const outputDir = path.dirname(outputPath);
  await fsPromises.mkdir(outputDir, { recursive: true });

  if (outputExtension === 'junit.xml') {
    await writeJunitXmlOutput(outputPath, evalRecord);
  } else if (outputExtension === 'csv') {
    // Use streamEvalCsv for memory-efficient CSV generation
    // This produces the same format as WebUI CSV exports
    const fileHandle = await fsPromises.open(outputPath, 'w');
    try {
      await streamEvalCsv(evalRecord, {
        isRedteam: Boolean(evalRecord.config.redteam),
        write: async (data: string) => {
          await fileHandle.write(data);
        },
      });
    } finally {
      await fileHandle.close();
    }
  } else if (outputExtension === 'json') {
    await writeJsonOutputSafely(outputPath, evalRecord, shareableUrl, options);
  } else if (outputExtension === 'yaml' || outputExtension === 'yml' || outputExtension === 'txt') {
    await fsPromises.writeFile(
      outputPath,
      yaml.dump(await createOutputData(evalRecord, shareableUrl, options)),
    );
  } else if (outputExtension === 'html') {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const summary = await evalRecord.toEvaluateSummary();
    const redactedConfig = sanitizeConfigForOutput(evalRecord.config);
    const metadata = createOutputMetadata(evalRecord);
    const template = await fsPromises.readFile(
      path.join(getDirectory(), 'tableOutput.html'),
      'utf-8',
    );
    const htmlTable = [
      [
        ...table.head.vars,
        ...table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
      ],
      ...table.body.map((row, rowIndex) => [
        ...row.vars.map((value, variableIndex) => ({
          kind: 'variable',
          name: table.head.vars[variableIndex],
          text: value,
        })),
        ...row.outputs.map((output, outputIndex) => ({
          kind: 'output',
          detailId: `result-detail-${rowIndex}-${outputIndex}`,
          detailTitle: `Result detail - row ${rowIndex + 1}, prompt ${outputIndex + 1}`,
          description: row.description || row.test?.description || '',
          ...outputToHtmlReportCell(output),
        })),
      ]),
    ];
    const reportOutputs = table.body.flatMap((row) => row.outputs);
    const totalResults = reportOutputs.length;
    const successes = reportOutputs.filter((output) => output.pass).length;
    const errors = reportOutputs.filter(
      (output) => !output.pass && output.failureReason === ResultFailureReason.ERROR,
    ).length;
    const failures = totalResults - successes - errors;
    const passRate = totalResults > 0 ? (successes / totalResults) * 100 : 0;
    const htmlOutput = getNunjucksEngine().renderString(template, {
      config: redactedConfig,
      table: htmlTable,
      results: summary,
      metadata,
      report: {
        totalResults,
        totalRows: table.body.length,
        promptCount: table.head.prompts.length,
        variableCount: table.head.vars.length,
        successes,
        failures,
        errors,
        passRateDisplay: `${passRate.toFixed(1)}%`,
      },
    });
    await fsPromises.writeFile(outputPath, htmlOutput);
  } else if (outputExtension === 'jsonl') {
    const jsonlOutputPath = await resolveJsonlOutputPath(outputPath);
    if (jsonlOutputPath !== outputPath) {
      // For a symlink, the mkdir above only ensured the link's own directory. Ensure the
      // resolved target's directory exists too, so the sibling temp-file rewrite can land
      // next to it (a symlink may point at a target in a not-yet-created directory).
      await fsPromises.mkdir(path.dirname(jsonlOutputPath), { recursive: true });
    }
    const outputMode = await getExistingFileMode(jsonlOutputPath);
    const recoveredResults = evalRecord.resultPersistenceFailed
      ? await collectJsonlResultsAfterPersistenceFailure(jsonlOutputPath, evalRecord)
      : undefined;
    const tempOutputPath = path.join(
      path.dirname(jsonlOutputPath),
      `.promptfoo-${randomUUID()}.tmp`,
    );
    try {
      try {
        await fsPromises.writeFile(tempOutputPath, '');
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          logger.warn(
            '[Output] Falling back to JSONL rewrite with external backup because the output directory is not writable',
          );
          await rewriteJsonlWithExternalBackup(
            jsonlOutputPath,
            outputMode,
            evalRecord,
            undefined,
            recoveredResults,
          );
          return;
        }
        throw error;
      }
      await appendJsonlResults(tempOutputPath, evalRecord, recoveredResults);
      if (outputMode !== undefined) {
        await fsPromises.chmod(tempOutputPath, outputMode);
      }
      try {
        await fsPromises.rename(tempOutputPath, jsonlOutputPath);
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          logger.warn(
            '[Output] Falling back to JSONL rewrite with external backup because replacing the output file is not permitted',
          );
          await rewriteJsonlWithExternalBackup(
            jsonlOutputPath,
            outputMode,
            evalRecord,
            tempOutputPath,
          );
          await removeTemporaryJsonlOutput(tempOutputPath);
          return;
        }
        throw error;
      }
    } catch (error) {
      await removeTemporaryJsonlOutput(tempOutputPath);
      throw error;
    }
  } else if (outputExtension === 'xml') {
    const summary = await evalRecord.toEvaluateSummary();
    const redactedConfig = sanitizeConfigForOutput(evalRecord.config);

    // Sanitize data for XML builder to prevent textValue.replace errors
    const sanitizeForXml = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return '';
      }
      if (typeof obj === 'boolean' || typeof obj === 'number') {
        return String(obj);
      }
      if (typeof obj === 'string') {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeForXml);
      }
      if (typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeForXml(value);
        }
        return sanitized;
      }
      // For any other type, convert to string
      return String(obj);
    };

    const xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  ',
    });
    const xmlData = xmlBuilder.build({
      promptfoo: {
        evalId: evalRecord.id,
        results: sanitizeForXml(summary),
        config: sanitizeForXml(redactedConfig),
        shareableUrl: shareableUrl || '',
      },
    });
    await fsPromises.writeFile(outputPath, xmlData);
  }
}

export async function writeMultipleOutputs(
  outputPaths: string[],
  evalRecord: Eval,
  shareableUrl: string | null,
) {
  const results = await Promise.allSettled(
    outputPaths.map((outputPath) => writeOutput(outputPath, evalRecord, shareableUrl)),
  );
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  if (errors.length > 0) {
    throw Object.assign(new Error('One or more output writes failed'), { errors });
  }
}
