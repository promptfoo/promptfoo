import { and, asc, count, desc, eq, isNotNull, like, or } from 'drizzle-orm';
import { getDb } from '../database/index';
import { modelAuditsTable } from '../database/tables';
import logger from '../logger';
import { randomSequence } from '../util/createHash';

import type { ModelAuditScanResults } from '../types/modelAudit';

export function createScanId(createdAt: Date = new Date()) {
  return `scan-${randomSequence(3)}-${createdAt.toISOString().slice(0, 19)}`;
}

export interface ModelAuditRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  name?: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  results: ModelAuditScanResults;
  checks?: ModelAuditScanResults['checks'] | null;
  issues?: ModelAuditScanResults['issues'] | null;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
  metadata?: Record<string, any> | null;
  // Revision tracking fields for deduplication
  modelId?: string | null;
  revisionSha?: string | null;
  contentHash?: string | null;
  modelSource?: string | null;
  sourceLastModified?: number | null;
  scannerVersion?: string | null;
}

export default class ModelAudit {
  id: string;
  createdAt: number;
  updatedAt: number;
  name?: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  results: ModelAuditScanResults;
  checks?: ModelAuditScanResults['checks'] | null;
  issues?: ModelAuditScanResults['issues'] | null;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
  metadata?: Record<string, any> | null;
  // Revision tracking fields for deduplication
  modelId?: string | null;
  revisionSha?: string | null;
  contentHash?: string | null;
  modelSource?: string | null;
  sourceLastModified?: number | null;
  scannerVersion?: string | null;
  persisted: boolean;

  constructor(data: Partial<ModelAuditRecord> & { persisted?: boolean }) {
    const createdAtDate = data.createdAt ? new Date(data.createdAt) : new Date();
    this.id = data.id || createScanId(createdAtDate);
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.name = data.name;
    this.author = data.author;
    this.modelPath = data.modelPath || '';
    this.modelType = data.modelType;
    this.results = data.results || {};
    this.checks = data.checks || data.results?.checks || null;
    this.issues = data.issues || data.results?.issues || null;

    // Ensure hasErrors is properly set based on actual critical/error findings
    const issues = data.issues || data.results?.issues;
    const resultsHasErrors = data.results?.has_errors ?? false;

    // If hasErrors is explicitly provided, use it; otherwise compute from results and issues
    if (data.hasErrors !== undefined) {
      this.hasErrors = data.hasErrors;
    } else {
      const hasActualErrors =
        resultsHasErrors ||
        (issues &&
          issues.some((issue) => issue.severity === 'critical' || issue.severity === 'error')) ||
        false;
      this.hasErrors = hasActualErrors;
    }

    this.totalChecks = data.totalChecks;
    this.passedChecks = data.passedChecks;
    this.failedChecks = data.failedChecks;
    this.metadata = data.metadata;
    // Revision tracking
    this.modelId = data.modelId;
    this.revisionSha = data.revisionSha;
    this.contentHash = data.contentHash;
    this.modelSource = data.modelSource;
    this.sourceLastModified = data.sourceLastModified;
    this.scannerVersion = data.scannerVersion;
    this.persisted = data.persisted || false;
  }

  static async create(params: {
    name?: string;
    author?: string;
    modelPath: string;
    modelType?: string;
    results: ModelAuditScanResults;
    // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
    metadata?: Record<string, any>;
    // Revision tracking fields
    modelId?: string;
    revisionSha?: string | null;
    contentHash?: string;
    modelSource?: string;
    sourceLastModified?: number;
    scannerVersion?: string;
  }): Promise<ModelAudit> {
    const now = Date.now();
    const createdAtDate = new Date(now);
    const id = createScanId(createdAtDate);

    // Ensure hasErrors is properly set based on actual critical/error findings
    const hasActualErrors = Boolean(
      params.results.has_errors ||
        (params.results.issues &&
          params.results.issues.some(
            (issue) => issue.severity === 'critical' || issue.severity === 'error',
          )),
    );

    const data = {
      id,
      createdAt: now,
      updatedAt: now,
      name: params.name || null,
      author: params.author || null,
      modelPath: params.modelPath,
      modelType: params.modelType || null,
      results: params.results,
      checks: params.results.checks || null,
      issues: params.results.issues || null,
      hasErrors: hasActualErrors,
      totalChecks: params.results.total_checks || null,
      passedChecks: params.results.passed_checks || null,
      failedChecks: params.results.failed_checks || null,
      metadata: params.metadata || null,
      // Revision tracking
      modelId: params.modelId || null,
      revisionSha: params.revisionSha ?? null,
      contentHash: params.contentHash || null,
      modelSource: params.modelSource || null,
      sourceLastModified: params.sourceLastModified || null,
      scannerVersion: params.scannerVersion || null,
    };
    const db = getDb();
    db.insert(modelAuditsTable).values(data).run();

    logger.debug(`Created model audit ${id} for ${params.modelPath}`);

    return new ModelAudit({ ...data, persisted: true });
  }

  static async findById(id: string): Promise<ModelAudit | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(modelAuditsTable)
      .where(eq(modelAuditsTable.id, id))
      .get();

    if (!result) {
      return null;
    }

    return new ModelAudit({ ...result, persisted: true });
  }

  static async findByModelPath(modelPath: string): Promise<ModelAudit[]> {
    const db = getDb();
    const results = await db
      .select()
      .from(modelAuditsTable)
      .where(eq(modelAuditsTable.modelPath, modelPath))
      .orderBy(modelAuditsTable.createdAt)
      .all();

    return results.map((r) => new ModelAudit({ ...r, persisted: true }));
  }

  /**
   * Find existing model audit by revision information for deduplication.
   * Checks both revision_sha and content_hash based on availability.
   *
   * Strategy:
   * 1. If revisionSha provided, check (modelId, revisionSha) first (fast path for HF)
   * 2. If not found, check (modelId, contentHash) as fallback
   *
   * @param modelId - Normalized model identifier
   * @param revisionSha - Native revision (HF Git SHA, S3 version ID, etc.) - optional
   * @param contentHash - SHA-256 of actual content - optional
   * @returns Existing ModelAudit or null if not found
   */
  static async findByRevision(
    modelId: string,
    revisionSha?: string | null,
    contentHash?: string,
  ): Promise<ModelAudit | null> {
    const db = getDb();

    // Build query conditions based on available fields
    const conditions = [];

    // If we have revision_sha, check (modelId, revisionSha)
    if (revisionSha) {
      conditions.push(
        and(
          eq(modelAuditsTable.modelId, modelId),
          eq(modelAuditsTable.revisionSha, revisionSha),
          isNotNull(modelAuditsTable.revisionSha),
        ),
      );
    }

    // If we have contentHash, check (modelId, contentHash)
    if (contentHash) {
      conditions.push(
        and(eq(modelAuditsTable.modelId, modelId), eq(modelAuditsTable.contentHash, contentHash)),
      );
    }

    // If no conditions, return null
    if (conditions.length === 0) {
      return null;
    }

    // Query with OR condition (check either revision_sha or content_hash)
    const result = await db
      .select()
      .from(modelAuditsTable)
      .where(or(...conditions))
      .orderBy(desc(modelAuditsTable.createdAt))
      .get();

    if (!result) {
      return null;
    }

    logger.debug(`Found existing scan for ${modelId} (id: ${result.id})`);
    return new ModelAudit({ ...result, persisted: true });
  }

  /**
   * Get multiple model audits with pagination, sorting, and optional search.
   *
   * Note: The search parameter is safely handled by Drizzle ORM's `like()` function,
   * which uses parameterized queries under the hood. The search string is passed as
   * a bound parameter, not interpolated into the SQL string, preventing SQL injection.
   */
  static async getMany(
    limit: number = 100,
    offset: number = 0,
    sortField: 'createdAt' | 'name' | 'modelPath' = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    search?: string,
  ): Promise<ModelAudit[]> {
    const db = getDb();

    // Build the base query
    let query = db.select().from(modelAuditsTable);

    // Apply search filter if provided
    // Note: Drizzle ORM's like() uses parameterized queries, making this safe from SQL injection
    if (search) {
      query = query.where(
        or(
          like(modelAuditsTable.name, `%${search}%`),
          like(modelAuditsTable.modelPath, `%${search}%`),
          like(modelAuditsTable.id, `%${search}%`),
        ),
      ) as typeof query;
    }

    // Determine the sort column using explicit allowlist mapping
    const sortColumn =
      sortField === 'name'
        ? modelAuditsTable.name
        : sortField === 'modelPath'
          ? modelAuditsTable.modelPath
          : modelAuditsTable.createdAt;

    // Apply ordering
    if (sortOrder === 'asc') {
      query = query.orderBy(asc(sortColumn)) as typeof query;
    } else {
      query = query.orderBy(desc(sortColumn)) as typeof query;
    }

    // Apply pagination
    const results = await query.limit(limit).offset(offset).all();

    return results.map((r) => new ModelAudit({ ...r, persisted: true }));
  }

  static async count(search?: string): Promise<number> {
    const db = getDb();

    let query = db.select({ value: count() }).from(modelAuditsTable);

    // Apply search filter if provided
    if (search) {
      query = query.where(
        or(
          like(modelAuditsTable.name, `%${search}%`),
          like(modelAuditsTable.modelPath, `%${search}%`),
          like(modelAuditsTable.id, `%${search}%`),
        ),
      ) as typeof query;
    }

    const result = await query.get();
    return result?.value || 0;
  }

  static async getLatest(limit: number = 10): Promise<ModelAudit[]> {
    const db = getDb();
    const results = await db
      .select()
      .from(modelAuditsTable)
      .orderBy(desc(modelAuditsTable.createdAt))
      .limit(limit)
      .all();

    return results.map((r) => new ModelAudit({ ...r, persisted: true }));
  }

  /**
   * Get the most recent model audit scan.
   * @returns The latest model audit or undefined if none exists.
   */
  static async latest(): Promise<ModelAudit | undefined> {
    return (await this.getLatest(1))[0];
  }

  async save(): Promise<void> {
    const db = getDb();
    const now = Date.now();

    if (this.persisted) {
      await db
        .update(modelAuditsTable)
        .set({
          name: this.name,
          author: this.author,
          modelPath: this.modelPath,
          modelType: this.modelType,
          results: this.results,
          checks: this.results?.checks || null,
          issues: this.results?.issues || null,
          hasErrors: this.hasErrors,
          totalChecks: this.totalChecks,
          passedChecks: this.passedChecks,
          failedChecks: this.failedChecks,
          metadata: this.metadata,
          // Revision tracking
          modelId: this.modelId,
          revisionSha: this.revisionSha,
          contentHash: this.contentHash,
          modelSource: this.modelSource,
          sourceLastModified: this.sourceLastModified,
          scannerVersion: this.scannerVersion,
          updatedAt: now,
        })
        .where(eq(modelAuditsTable.id, this.id))
        .run();
    } else {
      await db
        .insert(modelAuditsTable)
        .values({
          id: this.id,
          name: this.name,
          author: this.author,
          modelPath: this.modelPath,
          modelType: this.modelType,
          results: this.results,
          checks: this.results?.checks || null,
          issues: this.results?.issues || null,
          hasErrors: this.hasErrors,
          totalChecks: this.totalChecks,
          passedChecks: this.passedChecks,
          failedChecks: this.failedChecks,
          metadata: this.metadata,
          // Revision tracking
          modelId: this.modelId,
          revisionSha: this.revisionSha,
          contentHash: this.contentHash,
          modelSource: this.modelSource,
          sourceLastModified: this.sourceLastModified,
          scannerVersion: this.scannerVersion,
          createdAt: this.createdAt || now,
          updatedAt: now,
        })
        .run();
      this.persisted = true;
    }
  }

  async delete(): Promise<void> {
    if (!this.persisted) {
      return;
    }

    const db = getDb();
    db.delete(modelAuditsTable).where(eq(modelAuditsTable.id, this.id)).run();

    this.persisted = false;
  }

  toJSON(): ModelAuditRecord {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      name: this.name,
      author: this.author,
      modelPath: this.modelPath,
      modelType: this.modelType,
      results: this.results,
      checks: this.checks,
      issues: this.issues,
      hasErrors: this.hasErrors,
      totalChecks: this.totalChecks,
      passedChecks: this.passedChecks,
      failedChecks: this.failedChecks,
      metadata: this.metadata,
    };
  }
}
