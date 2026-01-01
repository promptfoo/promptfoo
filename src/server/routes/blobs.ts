import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { getBlobByHash, getBlobUrl } from '../../blobs';
import { isBlobStorageEnabled } from '../../blobs/extractor';
import { getDb } from '../../database';
import {
  blobAssetsTable,
  blobReferencesTable,
  evalResultsTable,
  evalsTable,
} from '../../database/tables';
import logger from '../../logger';
import type { Request, Response } from 'express';

export const blobsRouter = express.Router();

const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;

// Zod schemas for request validation
const MediaLibraryQuerySchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'other']).optional(),
  evalId: z.string().min(1).max(128).optional(),
  hash: z.string().regex(BLOB_HASH_REGEX).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  sortField: z.enum(['createdAt', 'sizeBytes']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Determine media kind from mime type
 */
function getKindFromMimeType(mimeType: string): 'image' | 'video' | 'audio' | 'other' {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'other';
}

/**
 * Helper to parse SQLite timestamps (can be string or number)
 */
function parseTimestamp(value: unknown): string {
  if (typeof value === 'number') {
    // If timestamp is > 1e12, it's in milliseconds; otherwise in seconds
    const msTimestamp = value > 1e12 ? value : value * 1000;
    return new Date(msTimestamp).toISOString();
  }
  if (typeof value === 'string') {
    // SQLite CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS"
    return new Date(value.replace(' ', 'T') + 'Z').toISOString();
  }
  logger.warn('parseTimestamp received unexpected value type, using current time', {
    valueType: typeof value,
  });
  return new Date().toISOString();
}

/**
 * List all media items from blob storage with optional filtering
 * GET /api/blobs/library
 *
 * Query params:
 * - type: Filter by kind (image, video, audio, other)
 * - evalId: Filter by evaluation ID
 * - hash: Filter by specific blob hash (for deep linking)
 * - limit: Number of items per page (default: 30, max: 100)
 * - offset: Pagination offset
 *
 * Performance notes:
 * For large blob libraries (10k+ items), consider adding database indexes:
 * - CREATE INDEX idx_blob_assets_created_at ON blob_assets(created_at DESC);
 * - CREATE INDEX idx_blob_assets_mime_type ON blob_assets(mime_type);
 * - CREATE INDEX idx_blob_refs_eval_id ON blob_references(eval_id);
 * - CREATE INDEX idx_blob_refs_blob_hash ON blob_references(blob_hash);
 */
blobsRouter.get('/library', async (req: Request, res: Response): Promise<void> => {
  if (!isBlobStorageEnabled()) {
    res.json({ success: true, data: { items: [], total: 0, hasMore: false } });
    return;
  }

  // Validate query parameters
  const parseResult = MediaLibraryQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid query parameters',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { type, evalId, hash, limit, offset, sortField, sortOrder } = parseResult.data;

  // Build ORDER BY clause based on sort parameters
  const getSortColumn = () => {
    switch (sortField) {
      case 'sizeBytes':
        return blobAssetsTable.sizeBytes;
      case 'createdAt':
      default:
        return blobAssetsTable.createdAt;
    }
  };
  const sortColumn = getSortColumn();
  const orderByFn = sortOrder === 'asc' ? asc : desc;

  try {
    const db = getDb();

    // Build WHERE conditions for filtering
    const filterConditions = [];

    if (hash) {
      filterConditions.push(eq(blobAssetsTable.hash, hash));
    }

    if (evalId) {
      filterConditions.push(eq(blobReferencesTable.evalId, evalId));
    }

    if (type) {
      switch (type) {
        case 'image':
          filterConditions.push(like(blobAssetsTable.mimeType, 'image/%'));
          break;
        case 'video':
          filterConditions.push(like(blobAssetsTable.mimeType, 'video/%'));
          break;
        case 'audio':
          filterConditions.push(like(blobAssetsTable.mimeType, 'audio/%'));
          break;
        case 'other':
          filterConditions.push(
            sql`${blobAssetsTable.mimeType} NOT LIKE 'image/%' AND ${blobAssetsTable.mimeType} NOT LIKE 'video/%' AND ${blobAssetsTable.mimeType} NOT LIKE 'audio/%'`,
          );
          break;
      }
    }

    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    // Get total count of unique blobs matching filters
    const countResult = db
      .select({ count: sql<number>`COUNT(DISTINCT ${blobAssetsTable.hash})` })
      .from(blobAssetsTable)
      .innerJoin(blobReferencesTable, eq(blobAssetsTable.hash, blobReferencesTable.blobHash))
      .where(whereClause)
      .get();

    const total = countResult?.count ?? 0;

    // Use a subquery to get the most recent reference for each unique blob hash
    // This ensures we get exactly `limit` unique items and deduplication happens at DB level
    const orderDirection = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;
    const uniqueBlobsQuery = sql`
      SELECT DISTINCT ${blobAssetsTable.hash} as hash
      FROM ${blobAssetsTable}
      INNER JOIN ${blobReferencesTable} ON ${blobAssetsTable.hash} = ${blobReferencesTable.blobHash}
      ${whereClause ? sql`WHERE ${whereClause}` : sql``}
      ORDER BY ${sortColumn} ${orderDirection}
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Get unique blob hashes first
    const uniqueHashes = await db.all<{ hash: string }>(uniqueBlobsQuery);

    if (uniqueHashes.length === 0) {
      res.json({ success: true, data: { items: [], total, hasMore: false } });
      return;
    }

    // Now fetch full details for these specific hashes with their most recent reference
    // Using a correlated subquery to get the latest reference per blob
    const items = db
      .select({
        hash: blobAssetsTable.hash,
        mimeType: blobAssetsTable.mimeType,
        sizeBytes: blobAssetsTable.sizeBytes,
        createdAt: blobAssetsTable.createdAt,
        evalId: blobReferencesTable.evalId,
        testIdx: blobReferencesTable.testIdx,
        promptIdx: blobReferencesTable.promptIdx,
        location: blobReferencesTable.location,
        kind: blobReferencesTable.kind,
        evalDescription: evalsTable.description,
        provider: evalResultsTable.provider,
        prompt: evalResultsTable.prompt,
        success: evalResultsTable.success,
        score: evalResultsTable.score,
        gradingResult: evalResultsTable.gradingResult,
        testCase: evalResultsTable.testCase,
        latencyMs: evalResultsTable.latencyMs,
        cost: evalResultsTable.cost,
      })
      .from(blobAssetsTable)
      .innerJoin(
        blobReferencesTable,
        and(
          eq(blobAssetsTable.hash, blobReferencesTable.blobHash),
          // Get the most recent reference for each blob
          eq(
            blobReferencesTable.createdAt,
            sql`(SELECT MAX(r2.created_at) FROM blob_references r2 WHERE r2.blob_hash = ${blobAssetsTable.hash})`,
          ),
        ),
      )
      .leftJoin(evalsTable, eq(blobReferencesTable.evalId, evalsTable.id))
      .leftJoin(
        evalResultsTable,
        and(
          eq(blobReferencesTable.evalId, evalResultsTable.evalId),
          eq(blobReferencesTable.testIdx, evalResultsTable.testIdx),
          eq(blobReferencesTable.promptIdx, evalResultsTable.promptIdx),
        ),
      )
      .where(
        sql`${blobAssetsTable.hash} IN (${sql.join(
          uniqueHashes.map((h) => sql`${h.hash}`),
          sql`, `,
        )})`,
      )
      .orderBy(orderByFn(sortColumn))
      .all();

    // Transform to response format
    const responseItems = items.map((item) => {
      // Extract provider ID from the JSON provider object
      let providerId: string | undefined;
      if (item.provider && typeof item.provider === 'object') {
        const providerObj = item.provider as { id?: string; label?: string };
        providerId = providerObj.label || providerObj.id;
      }

      // Extract raw prompt text from the JSON prompt object
      let promptText: string | undefined;
      if (item.prompt && typeof item.prompt === 'object') {
        const promptObj = item.prompt as { raw?: string; label?: string };
        promptText = promptObj.raw;
      }

      // Extract variables from test case
      let variables: Record<string, string> | undefined;
      if (item.testCase && typeof item.testCase === 'object') {
        const testCaseObj = item.testCase as { vars?: Record<string, unknown> };
        if (testCaseObj.vars && Object.keys(testCaseObj.vars).length > 0) {
          variables = {};
          for (const [key, value] of Object.entries(testCaseObj.vars)) {
            variables[key] = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          }
        }
      }

      // Extract grading results for display
      type ComponentResult = {
        pass: boolean;
        score: number;
        reason?: string;
        assertion?: { type?: string };
      };
      let graderResults:
        | Array<{ name: string; pass: boolean; score: number; reason?: string }>
        | undefined;
      if (item.gradingResult && typeof item.gradingResult === 'object') {
        const gradingObj = item.gradingResult as { componentResults?: ComponentResult[] };
        if (gradingObj.componentResults && Array.isArray(gradingObj.componentResults)) {
          graderResults = gradingObj.componentResults.map((comp, idx) => ({
            name: comp.assertion?.type || `Grader ${idx + 1}`,
            pass: comp.pass,
            score: comp.score,
            reason: comp.reason,
          }));
        }
      }

      return {
        hash: item.hash,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        kind: item.kind || getKindFromMimeType(item.mimeType),
        createdAt: parseTimestamp(item.createdAt),
        url: `/api/blobs/${item.hash}`,
        context: {
          evalId: item.evalId,
          evalDescription: item.evalDescription || undefined,
          testIdx: item.testIdx ?? undefined,
          promptIdx: item.promptIdx ?? undefined,
          location: item.location || undefined,
          provider: providerId,
          prompt: promptText,
          pass: item.success ?? undefined,
          score: item.score ?? undefined,
          variables,
          graderResults,
          latencyMs: item.latencyMs ?? undefined,
          cost: item.cost ?? undefined,
        },
      };
    });

    res.json({
      success: true,
      data: {
        items: responseItems,
        total,
        hasMore: offset + responseItems.length < total,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('[BlobRoute] Failed to list media library', {
      error: errorMessage,
      stack: errorStack,
    });
    res.status(500).json({ success: false, error: 'Failed to list media library' });
  }
});

/**
 * Get unique evals that have blob references (for filter dropdown)
 * GET /api/blobs/library/evals
 */
blobsRouter.get('/library/evals', async (_req: Request, res: Response): Promise<void> => {
  if (!isBlobStorageEnabled()) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const db = getDb();

    const evals = db
      .selectDistinct({
        evalId: blobReferencesTable.evalId,
        description: evalsTable.description,
        createdAt: evalsTable.createdAt,
      })
      .from(blobReferencesTable)
      .innerJoin(evalsTable, eq(blobReferencesTable.evalId, evalsTable.id))
      .orderBy(desc(evalsTable.createdAt))
      .limit(100)
      .all();

    res.json({
      success: true,
      data: evals.map((e) => ({
        evalId: e.evalId,
        description: e.description || `Eval ${e.evalId.slice(0, 8)}`,
        createdAt: e.createdAt ? parseTimestamp(e.createdAt) : undefined,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('[BlobRoute] Failed to list evals with media', {
      error: errorMessage,
      stack: errorStack,
    });
    res.status(500).json({ success: false, error: 'Failed to list evals' });
  }
});

blobsRouter.get('/:hash', async (req: Request, res: Response): Promise<void> => {
  if (!isBlobStorageEnabled()) {
    res.status(404).json({ error: 'Blob storage disabled' });
    return;
  }

  const { hash } = req.params;
  if (!BLOB_HASH_REGEX.test(hash)) {
    res.status(400).json({ error: 'Invalid blob hash' });
    return;
  }

  const db = getDb();
  const asset = db
    .select({
      hash: blobAssetsTable.hash,
      mimeType: blobAssetsTable.mimeType,
      sizeBytes: blobAssetsTable.sizeBytes,
      provider: blobAssetsTable.provider,
    })
    .from(blobAssetsTable)
    .where(eq(blobAssetsTable.hash, hash))
    .get();

  if (!asset) {
    res.status(404).json({ error: 'Blob not found' });
    return;
  }

  const reference = db
    .select({ evalId: blobReferencesTable.evalId })
    .from(blobReferencesTable)
    .where(eq(blobReferencesTable.blobHash, hash))
    .get();

  if (!reference) {
    logger.warn('[BlobRoute] Missing reference for blob access', { hash });
    res.status(403).json({ error: 'Not authorized to access this blob' });
    return;
  }

  try {
    const presigned = await getBlobUrl(hash);
    if (presigned) {
      res.redirect(302, presigned);
      return;
    }

    const blob = await getBlobByHash(hash);
    res.setHeader('Content-Type', blob.metadata.mimeType || asset.mimeType);
    res.setHeader('Content-Length', (blob.metadata.sizeBytes ?? asset.sizeBytes).toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'none');
    res.send(blob.data);
  } catch (error) {
    logger.error('[BlobRoute] Failed to serve blob', { error, hash });
    res.status(404).json({ error: 'Blob not found' });
  }
});
