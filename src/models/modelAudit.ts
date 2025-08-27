import { desc, eq } from 'drizzle-orm';
import { getDb } from '../database';
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
  metadata?: Record<string, any> | null;
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
  metadata?: Record<string, any> | null;
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
    this.persisted = data.persisted || false;
  }

  static async create(params: {
    name?: string;
    author?: string;
    modelPath: string;
    modelType?: string;
    results: ModelAuditScanResults;
    metadata?: Record<string, any>;
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
    };
    const db = getDb();
    await db.insert(modelAuditsTable).values(data).run();

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

  static async getMany(limit: number = 100): Promise<ModelAudit[]> {
    const db = getDb();
    const results = await db
      .select()
      .from(modelAuditsTable)
      .orderBy(desc(modelAuditsTable.createdAt))
      .limit(limit)
      .all();

    return results.map((r) => new ModelAudit({ ...r, persisted: true }));
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
    await db.delete(modelAuditsTable).where(eq(modelAuditsTable.id, this.id)).run();

    this.persisted = false;
  }

  toJSON(): ModelAuditRecord {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      name: this.name,
      modelPath: this.modelPath,
      modelType: this.modelType,
      results: this.results,
      hasErrors: this.hasErrors,
      totalChecks: this.totalChecks,
      passedChecks: this.passedChecks,
      failedChecks: this.failedChecks,
      metadata: this.metadata,
    };
  }
}
