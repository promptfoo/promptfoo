import crypto from 'crypto';
import fs from 'fs/promises';

import { BLOB_MAX_SIZE, storeBlob } from '../blobs';
import { getDb } from '../database/index';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import { getTraceStore } from '../tracing/store';
import { sha256 } from '../util/createHash';
import type { Command } from 'commander';
import type { ExportedBlobAsset, TraceData } from '../types';

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

const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
const MAX_EXPORTED_BLOB_BASE64_LENGTH = Math.ceil(BLOB_MAX_SIZE / 3) * 4 + 4;

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

async function importBlobAssets(blobAssets: unknown): Promise<void> {
  if (!Array.isArray(blobAssets)) {
    return;
  }

  for (const asset of blobAssets) {
    if (!isImportableBlobAsset(asset)) {
      logger.debug('Skipping malformed embedded blob during import');
      continue;
    }

    const data = decodeBlobAsset(asset);
    if (sha256(data) !== asset.hash.toLowerCase()) {
      throw new Error(`Embedded blob hash mismatch for ${asset.hash}`);
    }

    const { ref } = await storeBlob(data, asset.mimeType);
    if (ref.hash !== asset.hash.toLowerCase()) {
      throw new Error(`Embedded blob hash mismatch for ${asset.hash}`);
    }
  }
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

async function importTraces(
  traces: unknown,
  evalId: string,
  generateNewTraceIds: boolean,
): Promise<void> {
  if (!Array.isArray(traces)) {
    return;
  }

  const traceStore = getTraceStore();
  for (const trace of traces) {
    if (!isImportableTrace(trace)) {
      logger.debug('Skipping malformed trace during import');
      continue;
    }

    // Trace IDs are globally unique in the local trace store. Duplicate eval
    // imports need fresh IDs so spans never attach to the original eval.
    const traceId = generateNewTraceIds
      ? crypto.randomUUID().replaceAll('-', '')
      : trace.traceId;

    await traceStore.createTrace({
      traceId,
      evaluationId: evalId,
      testCaseId: trace.testCaseId,
      metadata: trace.metadata,
    });
    if (trace.spans.length > 0) {
      await traceStore.addSpans(traceId, trace.spans);
    }
  }
}

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval record from a JSON file')
    .option('--new-id', 'Generate a new eval ID instead of preserving the original')
    .option('--force', 'Replace existing eval with the same ID')
    .action(async (file, cmdObj) => {
      const db = getDb();
      let evalId: string;
      try {
        const fileContent = await fs.readFile(file, 'utf-8');
        const evalData = JSON.parse(fileContent);

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

          const vars = extractVars(evalData);
          const durations = extractDurations(evalData);
          await importBlobAssets(evalData.blobAssets);

          const evalRecord = await Eval.create(evalData.config, evalData.results.prompts, {
            id: cmdObj.newId ? undefined : importId,
            createdAt: importCreatedAt,
            author: importAuthor,
            completedPrompts: evalData.results.prompts,
            vars,
            runtimeOptions: evalData.runtimeOptions,
            ...durations,
          });
          await EvalResult.createManyFromEvaluateResult(evalData.results.results, evalRecord.id);
          await importTraces(evalData.traces, evalRecord.id, Boolean(cmdObj.newId));
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
        });
      } catch (error) {
        logger.error(`Failed to import eval: ${error}`);
        process.exitCode = 1;
      }
    });
}
