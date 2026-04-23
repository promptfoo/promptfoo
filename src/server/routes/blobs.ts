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
import { BlobsSchemas } from '../../types/api/blobs';
import { sendError } from '../utils/errors';
import type { Request, Response } from 'express';

export const blobsRouter = express.Router();

// Strict MIME type validation to prevent header injection attacks
// Only allow: type/subtype where both are alphanumeric with dash/underscore/plus
// Periods are NOT allowed to prevent attacks like "audio/wav.html" being interpreted as HTML
const SAFE_MIME_TYPE_REGEX = /^[a-z]+\/[a-z0-9_+-]+$/i;

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
 * Security notes (OSS / local-only):
 * In the OSS version, this is a local-only server with no user authentication.
 * For multi-tenant deployments (e.g., Promptfoo Cloud), additional authorization
 * is needed: verify the requesting user has access to the listed evaluations and
 * filter results by user/team ownership.
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
    res.json(
      BlobsSchemas.Library.Response.parse({
        success: true,
        data: { items: [], total: 0, hasMore: false, blobStorageEnabled: false },
      }),
    );
    return;
  }

  // Validate query parameters
  const parseResult = BlobsSchemas.Library.Query.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid query parameters',
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

    // Get unique blob hashes for the current page using Drizzle query builder
    const uniqueHashes = db
      .selectDistinct({ hash: blobAssetsTable.hash })
      .from(blobAssetsTable)
      .innerJoin(blobReferencesTable, eq(blobAssetsTable.hash, blobReferencesTable.blobHash))
      .where(whereClause)
      .orderBy(orderByFn(sortColumn), asc(blobAssetsTable.hash))
      .limit(limit)
      .offset(offset)
      .all();

    if (uniqueHashes.length === 0) {
      res.json(
        BlobsSchemas.Library.Response.parse({
          success: true,
          data: { items: [], total, hasMore: false },
        }),
      );
      return;
    }

    // Fetch full details for these specific hashes with their most recent reference.
    // When an evalId filter is active, restrict to references from that eval so
    // context is always consistent with the filter. Use rowid as a temporal
    // tiebreaker (monotonic integer) instead of text id (lexical UUID).
    const evalFilterClause = evalId ? sql` AND r2.eval_id = ${evalId}` : sql``;

    // Only include heavy columns (prompt, testCase, gradingResult, latencyMs,
    // cost) when fetching a single item by hash (detail view). For list queries,
    // these fields are unnecessary for the grid card and inflate the payload.
    const isDetailRequest = !!hash;

    const selectColumns = {
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
      success: evalResultsTable.success,
      score: evalResultsTable.score,
      ...(isDetailRequest && {
        prompt: evalResultsTable.prompt,
        gradingResult: evalResultsTable.gradingResult,
        testCase: evalResultsTable.testCase,
        latencyMs: evalResultsTable.latencyMs,
        cost: evalResultsTable.cost,
      }),
    };

    const items = db
      .select(selectColumns)
      .from(blobAssetsTable)
      .innerJoin(
        blobReferencesTable,
        and(
          eq(blobAssetsTable.hash, blobReferencesTable.blobHash),
          // Pick one reference per blob: most recent by created_at, rowid as tiebreaker
          eq(
            blobReferencesTable.id,
            sql`(SELECT r2.id FROM blob_references r2 WHERE r2.blob_hash = ${blobAssetsTable.hash}${evalFilterClause} ORDER BY r2.created_at DESC, r2.rowid DESC LIMIT 1)`,
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
      .orderBy(orderByFn(sortColumn), asc(blobAssetsTable.hash))
      .all();

    // Transform to response format
    const responseItems = items.map((item) => {
      const row = item as Record<string, unknown>;

      // Extract provider ID from the JSON provider (object or legacy string format)
      let providerId: string | undefined;
      if (typeof item.provider === 'string') {
        providerId = item.provider;
      } else if (item.provider && typeof item.provider === 'object') {
        const providerObj = item.provider as { id?: string; label?: string };
        providerId = providerObj.label || providerObj.id;
      }

      // Detail-only fields: only processed when hash filter is active
      let promptText: string | undefined;
      let variables: Record<string, string> | undefined;
      type ComponentResult = {
        pass: boolean;
        score: number;
        reason?: string;
        assertion?: { type?: string };
      };
      let graderResults:
        | Array<{ name: string; pass: boolean; score: number; reason?: string }>
        | undefined;

      if (isDetailRequest) {
        // Extract raw prompt text from the JSON prompt object
        if (row.prompt && typeof row.prompt === 'object') {
          const promptObj = row.prompt as { raw?: string; label?: string };
          promptText = promptObj.raw;
        }

        // Extract variables from test case
        if (row.testCase && typeof row.testCase === 'object') {
          const testCaseObj = row.testCase as { vars?: Record<string, unknown> };
          if (testCaseObj.vars && Object.keys(testCaseObj.vars).length > 0) {
            variables = {};
            for (const [key, value] of Object.entries(testCaseObj.vars)) {
              variables[key] = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            }
          }
        }

        // Extract grading results for display
        if (row.gradingResult && typeof row.gradingResult === 'object') {
          const gradingObj = row.gradingResult as { componentResults?: ComponentResult[] };
          if (gradingObj.componentResults && Array.isArray(gradingObj.componentResults)) {
            graderResults = gradingObj.componentResults.map((comp, idx) => ({
              name: comp.assertion?.type || `Grader ${idx + 1}`,
              pass: comp.pass,
              score: comp.score,
              reason: comp.reason,
            }));
          }
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
          pass: item.success ?? undefined,
          score: item.score ?? undefined,
          // Detail-only context fields (only present when fetching by hash)
          ...(isDetailRequest && {
            prompt: promptText,
            variables,
            graderResults,
            latencyMs: (row.latencyMs as number) ?? undefined,
            cost: (row.cost as number) ?? undefined,
          }),
        },
      };
    });

    res.json(
      BlobsSchemas.Library.Response.parse({
        success: true,
        data: {
          items: responseItems,
          total,
          hasMore: offset + uniqueHashes.length < total,
        },
      }),
    );
  } catch (error) {
    sendError(res, 500, 'Failed to list media library', error);
  }
});

/**
 * Get unique evals that have blob references (for filter dropdown)
 * GET /api/blobs/library/evals
 *
 * Security notes (OSS / local-only):
 * Same auth model as /library — local-only, no user auth.
 * Multi-tenant deployments must scope results to the requesting user's evals.
 */
blobsRouter.get('/library/evals', async (req: Request, res: Response): Promise<void> => {
  if (!isBlobStorageEnabled()) {
    res.json(BlobsSchemas.LibraryEvals.Response.parse({ success: true, data: [] }));
    return;
  }

  // Validate query parameters
  const parseResult = BlobsSchemas.LibraryEvals.Query.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid query parameters',
    });
    return;
  }

  const { limit, search } = parseResult.data;

  try {
    const db = getDb();

    const conditions = [];
    if (search) {
      // Escape SQL LIKE wildcards so user input is treated as literal text.
      // First escape backslashes (the ESCAPE character), then escape % and _.
      const escaped = search.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      conditions.push(
        sql`(${evalsTable.description} LIKE ${pattern} ESCAPE '\\' OR ${blobReferencesTable.evalId} LIKE ${pattern} ESCAPE '\\')`,
      );
    }

    const evals = db
      .selectDistinct({
        evalId: blobReferencesTable.evalId,
        description: evalsTable.description,
        createdAt: evalsTable.createdAt,
      })
      .from(blobReferencesTable)
      .innerJoin(evalsTable, eq(blobReferencesTable.evalId, evalsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(evalsTable.createdAt))
      .limit(limit)
      .all();

    res.json(
      BlobsSchemas.LibraryEvals.Response.parse({
        success: true,
        data: evals.map((e) => ({
          evalId: e.evalId,
          description: e.description || `Eval ${e.evalId.slice(0, 8)}`,
          createdAt: e.createdAt ? parseTimestamp(e.createdAt) : undefined,
        })),
      }),
    );
  } catch (error) {
    sendError(res, 500, 'Failed to list evals', error);
  }
});

blobsRouter.get('/:hash', async (req: Request, res: Response): Promise<void> => {
  if (!isBlobStorageEnabled()) {
    res.status(404).json({ error: 'Blob storage disabled' });
    return;
  }

  const paramsResult = BlobsSchemas.Get.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const { hash } = paramsResult.data;

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

  // Security: Check that a reference exists for this blob
  // NOTE: In the OSS version, this is a local-only server with no user authentication.
  // For multi-tenant deployments (e.g., Promptfoo Cloud), additional authorization is needed:
  // - Verify the requesting user has access to the evaluation (reference.evalId)
  // - Check user/team ownership before serving the blob
  // - Implement proper session/token-based authentication
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

    // Validate MIME type before setting header to prevent injection attacks
    const mimeType = blob.metadata.mimeType || asset.mimeType;
    if (SAFE_MIME_TYPE_REGEX.test(mimeType)) {
      res.setHeader('Content-Type', mimeType);
    } else {
      logger.warn('[BlobRoute] Invalid MIME type, using fallback', { mimeType, hash });
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    res.setHeader('Content-Length', (blob.metadata.sizeBytes ?? asset.sizeBytes).toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'none');
    res.send(blob.data);
  } catch (error) {
    logger.error('[BlobRoute] Failed to serve blob', { error, hash });
    res.status(404).json({ error: 'Blob not found' });
  }
});
