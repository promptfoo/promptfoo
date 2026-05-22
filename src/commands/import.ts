import crypto from 'crypto';
import fs from 'fs/promises';

import { BLOB_MAX_SIZE, recordBlobReference, storeBlob } from '../blobs';
import { BLOB_HASH_REGEX, collectBlobHashes } from '../blobs/blobRefs';
import { getDb } from '../database/index';
import { evalsTable } from '../database/tables';
import { parseImportFile } from '../importers/parse';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult, { stripTraceLinkageFromMetadata } from '../models/evalResult';
import telemetry from '../telemetry';
import { getTraceStore } from '../tracing/store';
import { sha256 } from '../util/createHash';
import type { Command } from 'commander';

import type {
  EvaluateResult,
  EvaluateSummaryV2,
  EvaluateSummaryV3,
  ExportedBlobAsset,
  TraceData,
  TraceSpan,
} from '../types';

function extractEvalId(evalData: any): string | undefined {
  return evalData.evalId || evalData.id;
}

function parseImportedDate(value: unknown, field: string): Date | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = new Date(value as string | number);
  if (Number.isNaN(parsed.getTime())) {
    logger.warn(
      `Imported eval has an unparseable ${field} (${JSON.stringify(value)}); falling back.`,
    );
    return undefined;
  }
  return parsed;
}

function extractCreatedAt(evalData: any): Date {
  // A present-but-corrupt timestamp must not reach createEvalId().toISOString(),
  // which would throw an opaque "Invalid time value" mid-import.
  return (
    parseImportedDate(evalData.metadata?.evaluationCreatedAt, 'metadata.evaluationCreatedAt') ??
    parseImportedDate(evalData.results?.timestamp, 'results.timestamp') ??
    parseImportedDate(evalData.createdAt, 'createdAt') ??
    new Date()
  );
}

function extractAuthor(evalData: any): string | undefined {
  if (evalData.metadata?.author) {
    return evalData.metadata.author;
  }
  return evalData.author;
}

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

/**
 * Prefer explicit vars from parity-aware exports; older exports derive vars from results.
 */
function extractVars(evalData: any): string[] {
  if (Array.isArray(evalData.vars)) {
    return evalData.vars.filter((value: unknown): value is string => typeof value === 'string');
  }
  return deriveVarsFromResults(evalData.results?.results || []);
}

function extractDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function extractDurations(evalData: any) {
  const stats = evalData.results?.stats;
  return {
    durationMs: extractDuration(stats?.durationMs),
    generationDurationMs: extractDuration(stats?.generationDurationMs),
    evaluationDurationMs: extractDuration(stats?.evaluationDurationMs),
  };
}

const MAX_EXPORTED_BLOB_BASE64_LENGTH = Math.ceil(BLOB_MAX_SIZE / 3) * 4 + 4;
// Portable exports are untrusted input; imported blobs must not become active same-origin content.
const IMPORTED_BLOB_MIME_TYPE_FALLBACK = 'application/octet-stream';
const SAFE_IMPORTED_BLOB_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/ogg',
  'video/webm',
]);
const SAFE_IMPORTED_AUDIO_MIME_TYPE_REGEX = /^audio\/[a-z0-9_+-]+$/i;

function isImportableV3Results(results: unknown): results is EvaluateSummaryV3 {
  const candidate = results as Partial<EvaluateSummaryV3>;
  return (
    results !== null &&
    typeof results === 'object' &&
    candidate.version === 3 &&
    Array.isArray(candidate.prompts) &&
    Array.isArray(candidate.results)
  );
}

function isImportableLegacyResults(results: unknown): results is EvaluateSummaryV2 {
  const candidate = results as Partial<EvaluateSummaryV2>;
  return (
    results !== null &&
    typeof results === 'object' &&
    candidate.version !== 3 &&
    Array.isArray(candidate.results) &&
    candidate.table !== null &&
    typeof candidate.table === 'object'
  );
}

function isImportableBlobAsset(asset: unknown): asset is ExportedBlobAsset {
  const candidate = asset as Partial<ExportedBlobAsset>;
  return (
    asset !== null &&
    typeof asset === 'object' &&
    typeof candidate.hash === 'string' &&
    BLOB_HASH_REGEX.test(candidate.hash) &&
    typeof candidate.mimeType === 'string' &&
    candidate.mimeType.length > 0 &&
    typeof candidate.sizeBytes === 'number' &&
    Number.isInteger(candidate.sizeBytes) &&
    candidate.sizeBytes >= 0 &&
    typeof candidate.data === 'string'
  );
}

function sanitizeImportedBlobMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (
    SAFE_IMPORTED_BLOB_MIME_TYPES.has(normalizedMimeType) ||
    SAFE_IMPORTED_AUDIO_MIME_TYPE_REGEX.test(normalizedMimeType)
  ) {
    return normalizedMimeType;
  }

  return IMPORTED_BLOB_MIME_TYPE_FALLBACK;
}

function decodeBlobAsset(asset: ExportedBlobAsset): Buffer {
  if (asset.sizeBytes > BLOB_MAX_SIZE || asset.data.length > MAX_EXPORTED_BLOB_BASE64_LENGTH) {
    throw new Error(`Embedded blob ${asset.hash} exceeds the ${BLOB_MAX_SIZE} byte import limit`);
  }

  const data = Buffer.from(asset.data, 'base64');
  if (data.length !== asset.sizeBytes) {
    throw new Error(`Embedded blob ${asset.hash} size does not match its exported metadata`);
  }
  return data;
}

function validateBlobAssetData(asset: ExportedBlobAsset): Buffer {
  const data = decodeBlobAsset(asset);
  if (sha256(data) !== asset.hash.toLowerCase()) {
    throw new Error(`Embedded blob hash mismatch for ${asset.hash}`);
  }
  return data;
}

interface PreparedBlobAsset {
  asset: ExportedBlobAsset;
  data: Buffer;
}

function prepareBlobAssets(
  blobAssets: unknown,
  referencedBlobHashes: ReadonlySet<string>,
): PreparedBlobAsset[] {
  if (!Array.isArray(blobAssets)) {
    return [];
  }

  const preparedAssets: PreparedBlobAsset[] = [];
  for (const asset of blobAssets) {
    if (!isImportableBlobAsset(asset)) {
      logger.warn('Skipping malformed embedded blob during import');
      continue;
    }
    if (!referencedBlobHashes.has(asset.hash.toLowerCase())) {
      logger.debug('Skipping unreferenced embedded blob during import');
      continue;
    }

    preparedAssets.push({ asset, data: validateBlobAssetData(asset) });
  }

  return preparedAssets;
}

async function importBlobAssets(blobAssets: PreparedBlobAsset[]): Promise<void> {
  for (const { asset, data } of blobAssets) {
    const { ref } = await storeBlob(data, sanitizeImportedBlobMimeType(asset.mimeType));
    if (ref.hash !== asset.hash.toLowerCase()) {
      throw new Error(`Embedded blob hash mismatch for ${asset.hash}`);
    }
  }
}

async function recordImportedBlobReferences(
  blobAssets: PreparedBlobAsset[],
  evalId: string,
): Promise<void> {
  await Promise.all(
    blobAssets.map(({ asset }) =>
      recordBlobReference(asset.hash.toLowerCase(), {
        evalId,
        location: 'import',
      }),
    ),
  );
}

/**
 * Deletes the eval being replaced by a --force import. Returns its ID when a
 * delete happened so the caller can disclose the data loss if the rest of the
 * import then fails.
 */
async function replaceExistingEval(
  existingEval: Eval | undefined,
  importId: string | undefined,
): Promise<string | undefined> {
  if (!existingEval) {
    return undefined;
  }

  logger.info(`Replacing existing eval ${importId}`);
  await existingEval.delete();
  return importId;
}

function isImportableTrace(trace: unknown): trace is TraceData {
  const candidate = trace as Partial<TraceData>;
  return (
    trace !== null &&
    typeof trace === 'object' &&
    typeof candidate.traceId === 'string' &&
    typeof candidate.testCaseId === 'string' &&
    Array.isArray(candidate.spans)
  );
}

function isImportableTraceSpan(span: unknown): span is TraceSpan {
  const candidate = span as Partial<TraceSpan>;
  return (
    span !== null &&
    typeof span === 'object' &&
    typeof candidate.spanId === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.startTime === 'number' &&
    Number.isFinite(candidate.startTime)
  );
}

function prepareTraces(traces: unknown): TraceData[] {
  if (!Array.isArray(traces)) {
    return [];
  }

  const preparedTraces: TraceData[] = [];
  for (const trace of traces) {
    if (!isImportableTrace(trace)) {
      logger.warn('Skipping malformed trace during import');
      continue;
    }

    const spans = trace.spans.filter((span): span is TraceSpan => {
      const importable = isImportableTraceSpan(span);
      if (!importable) {
        logger.warn('Skipping malformed trace span during import');
      }
      return importable;
    });
    preparedTraces.push({ ...trace, spans });
  }

  return preparedTraces;
}

async function importTraces(
  traces: TraceData[],
  evalId: string,
  generateNewTraceIds: boolean,
): Promise<Map<string, string>> {
  const traceStore = getTraceStore();
  const usedTraceIds = new Set<string>();
  const importedTraceIds = new Map<string, string>();
  for (const trace of traces) {
    // Trace IDs are globally unique in the local trace store. Duplicate eval
    // imports and conflicting imports need fresh IDs so spans never attach to
    // another eval's trace.
    let traceId = trace.traceId;
    if (generateNewTraceIds || usedTraceIds.has(traceId) || (await traceStore.getTrace(traceId))) {
      traceId = crypto.randomUUID().replaceAll('-', '');
    }
    usedTraceIds.add(traceId);

    await traceStore.createTrace({
      traceId,
      evaluationId: evalId,
      testCaseId: trace.testCaseId,
      metadata: trace.metadata,
    });
    if (trace.spans.length > 0) {
      await traceStore.addSpans(traceId, trace.spans);
    }
    importedTraceIds.set(trace.traceId, traceId);
  }
  return importedTraceIds;
}

function remapImportedResultTraceLinkage(
  results: EvaluateResult[],
  importedTraceIds: Map<string, string>,
  evalId: string,
): EvaluateResult[] {
  return results.map((result) => {
    const importedTraceId = result.traceId && importedTraceIds.get(result.traceId);
    if (importedTraceId) {
      return {
        ...result,
        traceId: importedTraceId,
        evaluationId: evalId,
      };
    }

    if (!result.traceId && !result.evaluationId) {
      return result;
    }

    const { traceId: _traceId, evaluationId: _evaluationId, ...unlinkedResult } = result;
    return {
      ...unlinkedResult,
      metadata: stripTraceLinkageFromMetadata(result.metadata),
    };
  });
}

interface ImportedEvalContext {
  newId: boolean;
  importId: string | undefined;
  importCreatedAt: Date;
  importAuthor: string | undefined;
}

async function createImportedV3Eval(
  evalData: any,
  traces: TraceData[],
  blobAssets: PreparedBlobAsset[],
  context: ImportedEvalContext,
): Promise<string> {
  logger.debug('Importing v3 eval');
  const evalRecord = await Eval.create(evalData.config, evalData.results.prompts, {
    id: context.newId ? undefined : context.importId,
    createdAt: context.importCreatedAt,
    author: context.importAuthor,
    completedPrompts: evalData.results.prompts,
    vars: extractVars(evalData),
    runtimeOptions: evalData.runtimeOptions,
    ...extractDurations(evalData),
  });
  const importedTraceIds = await importTraces(traces, evalRecord.id, context.newId);
  const importedResults = remapImportedResultTraceLinkage(
    evalData.results.results,
    importedTraceIds,
    evalRecord.id,
  );
  await EvalResult.createManyFromEvaluateResult(importedResults, evalRecord.id);
  await recordImportedBlobReferences(blobAssets, evalRecord.id);
  return evalRecord.id;
}

function createImportedV2Eval(evalData: any, context: ImportedEvalContext): string {
  logger.debug('Importing v2 eval');
  const evalId = context.newId
    ? createEvalId(context.importCreatedAt)
    : context.importId || createEvalId(context.importCreatedAt);
  getDb()
    .insert(evalsTable)
    .values({
      id: evalId,
      createdAt: context.importCreatedAt.getTime(),
      author: context.importAuthor,
      description: evalData.description || evalData.config?.description,
      results: evalData.results,
      config: evalData.config,
    })
    .run();
  return evalId;
}

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import a Promptfoo eval JSON export or an OpenAI Evals JSONL export')
    .option('--new-id', 'Generate a new eval ID instead of preserving the original')
    .option('--force', 'Replace existing eval with the same ID')
    .action(async (file, cmdObj) => {
      let evalId: string;
      // Tracks the eval a --force replace deleted, so a later failure can warn
      // the user it is gone instead of reporting an opaque error.
      let removedExistingEvalId: string | undefined;
      try {
        const fileContent = await fs.readFile(file, 'utf-8');
        const parsed = parseImportFile(fileContent);
        const evalData: any = parsed.evalData;
        const source = parsed.source;

        const importId = extractEvalId(evalData);
        const importCreatedAt = extractCreatedAt(evalData);
        const importAuthor = extractAuthor(evalData);
        let existingEval: Eval | undefined;

        if (importId && !cmdObj.newId) {
          const existing = await Eval.findById(importId);
          if (existing) {
            if (cmdObj.force) {
              existingEval = existing;
            } else {
              logger.error(
                `Eval ${importId} already exists. Use --new-id to import with a new ID, or --force to replace it.`,
              );
              process.exitCode = 1;
              return;
            }
          }
        }

        const importV3 = isImportableV3Results(evalData.results);
        const importLegacy = isImportableLegacyResults(evalData.results);
        if (!importV3 && !importLegacy) {
          throw new Error('Unsupported eval export results format');
        }

        const traces = importV3 ? prepareTraces(evalData.traces) : [];
        const blobAssets =
          importV3 && Array.isArray(evalData.blobAssets) && evalData.blobAssets.length > 0
            ? prepareBlobAssets(
                evalData.blobAssets,
                // Bound the scan: imported files are untrusted, and deeply
                // nested JSON would otherwise overflow the stack here.
                collectBlobHashes(
                  { results: evalData.results, traces },
                  { maxDepth: 64, maxStringLength: 100_000 },
                ),
              )
            : [];

        // Restore embedded media before the destructive replace so a corrupt
        // artifact cannot delete the existing eval. blobAssets is empty for v2.
        await importBlobAssets(blobAssets);
        removedExistingEvalId = await replaceExistingEval(existingEval, importId);

        const context: ImportedEvalContext = {
          newId: Boolean(cmdObj.newId),
          importId,
          importCreatedAt,
          importAuthor,
        };
        evalId = importV3
          ? await createImportedV3Eval(evalData, traces, blobAssets, context)
          : createImportedV2Eval(evalData, context);

        logger.info(`Eval with ID ${evalId} has been successfully imported.`);

        telemetry.record('command_used', {
          name: 'import',
          evalId,
          newId: cmdObj.newId || false,
          force: cmdObj.force || false,
          source,
        });
      } catch (error) {
        logger.error(
          `Failed to import eval: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (removedExistingEvalId) {
          logger.error(
            `The existing eval ${removedExistingEvalId} was deleted for a --force replacement that did not complete. Re-import it from a backup.`,
          );
        }
        process.exitCode = 1;
      }
    });
}
