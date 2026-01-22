import { desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../database/index';
import { evalResultsTable, evalsTable, testCasesTable } from '../database/tables';
import logger from '../logger';
import {
  type Assertion,
  type AtomicTestCase,
  ResultFailureReason,
  type TestCase as TestCaseType,
} from '../types/index';
import {
  computeTestCaseFingerprint,
  computeTestCaseId,
  extractFingerprintInput,
} from '../util/testCaseFingerprint';
import { getCurrentTimestamp } from '../util/time';

/**
 * Source type for test case provenance tracking.
 */
export type TestCaseSourceType =
  | 'inline'
  | 'csv'
  | 'json'
  | 'yaml'
  | 'hf'
  | 'generator'
  | 'backfill';

/**
 * Data structure for creating a test case record.
 */
export interface TestCaseCreateData {
  description?: string;
  vars?: Record<string, unknown>;
  asserts?: Assertion[];
  metadata?: Record<string, unknown>;
  sourceType?: TestCaseSourceType;
  sourceRef?: string;
  sourceRow?: number;
}

/**
 * Statistics for a test case across all evaluations.
 */
export interface TestCaseStats {
  totalResults: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  passRate: number;
  avgScore: number;
  avgLatencyMs: number | null;
  avgCost: number | null;
  evalCount: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
}

/**
 * Result history entry for a test case.
 */
export interface TestCaseHistoryEntry {
  evalId: string;
  evalCreatedAt: number;
  success: boolean;
  score: number;
  latencyMs: number | null;
  cost: number | null;
  provider: { id: string; label?: string };
  promptIdx: number;
}

/**
 * Model class for test cases with stable identity across evaluations.
 */
export default class TestCaseModel {
  public readonly id: string;
  public readonly fingerprint: string;
  public readonly description?: string;
  public readonly varsJson?: Record<string, unknown>;
  public readonly assertsJson?: Assertion[];
  public readonly metadataJson?: Record<string, unknown>;
  public readonly sourceType?: string;
  public readonly sourceRef?: string;
  public readonly sourceRow?: number;
  public readonly createdAt: number;
  public readonly updatedAt: number;

  constructor(data: {
    id: string;
    fingerprint: string;
    description?: string | null;
    varsJson?: Record<string, unknown> | null;
    assertsJson?: Assertion[] | null;
    metadataJson?: Record<string, unknown> | null;
    sourceType?: string | null;
    sourceRef?: string | null;
    sourceRow?: number | null;
    createdAt: number;
    updatedAt: number;
  }) {
    this.id = data.id;
    this.fingerprint = data.fingerprint;
    this.description = data.description ?? undefined;
    this.varsJson = data.varsJson ?? undefined;
    this.assertsJson = data.assertsJson ?? undefined;
    this.metadataJson = data.metadataJson ?? undefined;
    this.sourceType = data.sourceType ?? undefined;
    this.sourceRef = data.sourceRef ?? undefined;
    this.sourceRow = data.sourceRow ?? undefined;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Computes fingerprint and ID for a test case, then upserts it to the database.
   * If a test case with the same fingerprint already exists, returns the existing record.
   */
  static async upsert(data: TestCaseCreateData): Promise<TestCaseModel> {
    const fingerprint = computeTestCaseFingerprint({
      vars: data.vars,
      assert: data.asserts,
      description: data.description,
    });
    const id = computeTestCaseId(fingerprint);
    const now = getCurrentTimestamp();

    const db = getDb();

    // Try to insert, on conflict do nothing (fingerprint is unique)
    await db
      .insert(testCasesTable)
      .values({
        id,
        fingerprint,
        description: data.description,
        varsJson: data.vars,
        assertsJson: data.asserts,
        metadataJson: data.metadata,
        sourceType: data.sourceType,
        sourceRef: data.sourceRef,
        sourceRow: data.sourceRow,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    // Fetch and return the record
    const record = await db
      .select()
      .from(testCasesTable)
      .where(eq(testCasesTable.fingerprint, fingerprint))
      .get();

    if (!record) {
      throw new Error(`Failed to upsert test case with fingerprint: ${fingerprint}`);
    }

    return new TestCaseModel(record);
  }

  /**
   * Creates or retrieves a test case from an AtomicTestCase or TestCase.
   */
  static async fromTestCase(
    testCase: TestCaseType | AtomicTestCase,
    options?: {
      sourceType?: TestCaseSourceType;
      sourceRef?: string;
      sourceRow?: number;
    },
  ): Promise<TestCaseModel> {
    const fingerprintInput = extractFingerprintInput(testCase);
    return TestCaseModel.upsert({
      description: fingerprintInput.description,
      vars: fingerprintInput.vars,
      asserts: fingerprintInput.assert,
      metadata: testCase.metadata as Record<string, unknown> | undefined,
      sourceType: options?.sourceType,
      sourceRef: options?.sourceRef,
      sourceRow: options?.sourceRow,
    });
  }

  /**
   * Find a test case by its ID.
   */
  static async findById(id: string): Promise<TestCaseModel | null> {
    const db = getDb();
    const record = await db.select().from(testCasesTable).where(eq(testCasesTable.id, id)).get();

    if (!record) {
      return null;
    }

    return new TestCaseModel(record);
  }

  /**
   * Find a test case by its fingerprint.
   */
  static async findByFingerprint(fingerprint: string): Promise<TestCaseModel | null> {
    const db = getDb();
    const record = await db
      .select()
      .from(testCasesTable)
      .where(eq(testCasesTable.fingerprint, fingerprint))
      .get();

    if (!record) {
      return null;
    }

    return new TestCaseModel(record);
  }

  /**
   * Get statistics for a test case by ID, querying directly from eval_results.
   * This works even if the test case doesn't exist in the test_cases table.
   */
  static async getStatsById(testCaseId: string): Promise<TestCaseStats | null> {
    const db = getDb();

    const stats = await db
      .select({
        totalResults: sql<number>`COUNT(*)`.as('total_results'),
        passCount: sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 1 THEN 1 ELSE 0 END)`.as(
          'pass_count',
        ),
        failCount:
          sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 0 AND ${evalResultsTable.failureReason} = ${ResultFailureReason.ASSERT} THEN 1 ELSE 0 END)`.as(
            'fail_count',
          ),
        errorCount:
          sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 0 AND ${evalResultsTable.failureReason} = ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END)`.as(
            'error_count',
          ),
        avgScore: sql<number>`AVG(${evalResultsTable.score})`.as('avg_score'),
        avgLatencyMs: sql<number | null>`AVG(${evalResultsTable.latencyMs})`.as('avg_latency_ms'),
        avgCost: sql<number | null>`AVG(${evalResultsTable.cost})`.as('avg_cost'),
        evalCount: sql<number>`COUNT(DISTINCT ${evalResultsTable.evalId})`.as('eval_count'),
        firstSeenAt: sql<number | null>`MIN(${evalResultsTable.createdAt})`.as('first_seen_at'),
        lastSeenAt: sql<number | null>`MAX(${evalResultsTable.createdAt})`.as('last_seen_at'),
      })
      .from(evalResultsTable)
      .where(eq(evalResultsTable.testCaseId, testCaseId))
      .get();

    const totalResults = stats?.totalResults ?? 0;

    // Return null if no results found for this testCaseId
    if (totalResults === 0) {
      return null;
    }

    const passCount = stats?.passCount ?? 0;

    return {
      totalResults,
      passCount,
      failCount: stats?.failCount ?? 0,
      errorCount: stats?.errorCount ?? 0,
      passRate: totalResults > 0 ? passCount / totalResults : 0,
      avgScore: stats?.avgScore ?? 0,
      avgLatencyMs: stats?.avgLatencyMs ?? null,
      avgCost: stats?.avgCost ?? null,
      evalCount: stats?.evalCount ?? 0,
      firstSeenAt: stats?.firstSeenAt ?? null,
      lastSeenAt: stats?.lastSeenAt ?? null,
    };
  }

  /**
   * Get statistics for this test case across all evaluations.
   */
  async getStats(): Promise<TestCaseStats> {
    const db = getDb();

    const stats = await db
      .select({
        totalResults: sql<number>`COUNT(*)`.as('total_results'),
        passCount: sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 1 THEN 1 ELSE 0 END)`.as(
          'pass_count',
        ),
        failCount:
          sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 0 AND ${evalResultsTable.failureReason} = ${ResultFailureReason.ASSERT} THEN 1 ELSE 0 END)`.as(
            'fail_count',
          ),
        errorCount:
          sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 0 AND ${evalResultsTable.failureReason} = ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END)`.as(
            'error_count',
          ),
        avgScore: sql<number>`AVG(${evalResultsTable.score})`.as('avg_score'),
        avgLatencyMs: sql<number | null>`AVG(${evalResultsTable.latencyMs})`.as('avg_latency_ms'),
        avgCost: sql<number | null>`AVG(${evalResultsTable.cost})`.as('avg_cost'),
        evalCount: sql<number>`COUNT(DISTINCT ${evalResultsTable.evalId})`.as('eval_count'),
        firstSeenAt: sql<number | null>`MIN(${evalResultsTable.createdAt})`.as('first_seen_at'),
        lastSeenAt: sql<number | null>`MAX(${evalResultsTable.createdAt})`.as('last_seen_at'),
      })
      .from(evalResultsTable)
      .where(eq(evalResultsTable.testCaseId, this.id))
      .get();

    const totalResults = stats?.totalResults ?? 0;
    const passCount = stats?.passCount ?? 0;

    return {
      totalResults,
      passCount,
      failCount: stats?.failCount ?? 0,
      errorCount: stats?.errorCount ?? 0,
      passRate: totalResults > 0 ? passCount / totalResults : 0,
      avgScore: stats?.avgScore ?? 0,
      avgLatencyMs: stats?.avgLatencyMs ?? null,
      avgCost: stats?.avgCost ?? null,
      evalCount: stats?.evalCount ?? 0,
      firstSeenAt: stats?.firstSeenAt ?? null,
      lastSeenAt: stats?.lastSeenAt ?? null,
    };
  }

  /**
   * Get the history of results for this test case.
   */
  async getHistory(options?: { limit?: number; offset?: number }): Promise<TestCaseHistoryEntry[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const db = getDb();

    const results = await db
      .select({
        evalId: evalResultsTable.evalId,
        evalCreatedAt: evalsTable.createdAt,
        success: evalResultsTable.success,
        score: evalResultsTable.score,
        latencyMs: evalResultsTable.latencyMs,
        cost: evalResultsTable.cost,
        provider: evalResultsTable.provider,
        promptIdx: evalResultsTable.promptIdx,
      })
      .from(evalResultsTable)
      .innerJoin(evalsTable, eq(evalResultsTable.evalId, evalsTable.id))
      .where(eq(evalResultsTable.testCaseId, this.id))
      .orderBy(desc(evalsTable.createdAt))
      .limit(limit)
      .offset(offset);

    return results.map((r) => ({
      evalId: r.evalId,
      evalCreatedAt: r.evalCreatedAt,
      success: r.success,
      score: r.score,
      latencyMs: r.latencyMs,
      cost: r.cost,
      provider: r.provider as { id: string; label?: string },
      promptIdx: r.promptIdx,
    }));
  }

  /**
   * List test cases with optional pagination.
   */
  static async list(options?: { limit?: number; offset?: number }): Promise<TestCaseModel[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const db = getDb();

    const records = await db
      .select()
      .from(testCasesTable)
      .orderBy(desc(testCasesTable.createdAt))
      .limit(limit)
      .offset(offset);

    return records.map((r) => new TestCaseModel(r));
  }

  /**
   * List test cases with aggregated stats in a single optimized query.
   * This avoids N+1 queries by joining and grouping in one query.
   */
  static async listWithStats(options?: {
    limit?: number;
    offset?: number;
  }): Promise<Array<{ testCase: TestCaseModel; stats: TestCaseStats }>> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const db = getDb();

    // Use a single query with LEFT JOIN and GROUP BY to get test cases with their stats
    const results = await db
      .select({
        // Test case fields
        id: testCasesTable.id,
        fingerprint: testCasesTable.fingerprint,
        description: testCasesTable.description,
        varsJson: testCasesTable.varsJson,
        assertsJson: testCasesTable.assertsJson,
        metadataJson: testCasesTable.metadataJson,
        sourceType: testCasesTable.sourceType,
        sourceRef: testCasesTable.sourceRef,
        sourceRow: testCasesTable.sourceRow,
        createdAt: testCasesTable.createdAt,
        updatedAt: testCasesTable.updatedAt,
        // Aggregated stats
        totalResults: sql<number>`COUNT(${evalResultsTable.id})`.as('total_results'),
        passCount: sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 1 THEN 1 ELSE 0 END)`.as(
          'pass_count',
        ),
        failCount:
          sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 0 AND ${evalResultsTable.failureReason} = ${ResultFailureReason.ASSERT} THEN 1 ELSE 0 END)`.as(
            'fail_count',
          ),
        errorCount:
          sql<number>`SUM(CASE WHEN ${evalResultsTable.success} = 0 AND ${evalResultsTable.failureReason} = ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END)`.as(
            'error_count',
          ),
        avgScore: sql<number>`AVG(${evalResultsTable.score})`.as('avg_score'),
        avgLatencyMs: sql<number | null>`AVG(${evalResultsTable.latencyMs})`.as('avg_latency_ms'),
        avgCost: sql<number | null>`AVG(${evalResultsTable.cost})`.as('avg_cost'),
        evalCount: sql<number>`COUNT(DISTINCT ${evalResultsTable.evalId})`.as('eval_count'),
        firstSeenAt: sql<number | null>`MIN(${evalResultsTable.createdAt})`.as('first_seen_at'),
        lastSeenAt: sql<number | null>`MAX(${evalResultsTable.createdAt})`.as('last_seen_at'),
      })
      .from(testCasesTable)
      .leftJoin(evalResultsTable, eq(testCasesTable.id, evalResultsTable.testCaseId))
      .groupBy(testCasesTable.id)
      .orderBy(desc(sql`last_seen_at`), desc(testCasesTable.createdAt))
      .limit(limit)
      .offset(offset);

    return results.map((r) => {
      const totalResults = r.totalResults ?? 0;
      const passCount = r.passCount ?? 0;

      return {
        testCase: new TestCaseModel({
          id: r.id,
          fingerprint: r.fingerprint,
          description: r.description,
          varsJson: r.varsJson,
          assertsJson: r.assertsJson,
          metadataJson: r.metadataJson,
          sourceType: r.sourceType,
          sourceRef: r.sourceRef,
          sourceRow: r.sourceRow,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }),
        stats: {
          totalResults,
          passCount,
          failCount: r.failCount ?? 0,
          errorCount: r.errorCount ?? 0,
          passRate: totalResults > 0 ? passCount / totalResults : 0,
          avgScore: r.avgScore ?? 0,
          avgLatencyMs: r.avgLatencyMs ?? null,
          avgCost: r.avgCost ?? null,
          evalCount: r.evalCount ?? 0,
          firstSeenAt: r.firstSeenAt ?? null,
          lastSeenAt: r.lastSeenAt ?? null,
        },
      };
    });
  }

  /**
   * Backfill test case IDs for existing eval results that don't have one.
   * Returns the number of results updated.
   */
  static async backfillFromEvalResults(options?: { batchSize?: number }): Promise<number> {
    const batchSize = options?.batchSize ?? 1000;
    const db = getDb();
    let totalUpdated = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Get a batch of eval_results without test_case_id
      const results = await db
        .select({
          id: evalResultsTable.id,
          testCase: evalResultsTable.testCase,
        })
        .from(evalResultsTable)
        .where(isNull(evalResultsTable.testCaseId))
        .limit(batchSize);

      if (results.length === 0) {
        break;
      }

      // Process each result
      for (const result of results) {
        try {
          // Create/get test case
          const testCaseModel = await TestCaseModel.fromTestCase(result.testCase, {
            sourceType: 'backfill',
          });

          // Update the eval_result with test_case_id
          await db
            .update(evalResultsTable)
            .set({ testCaseId: testCaseModel.id })
            .where(eq(evalResultsTable.id, result.id));

          totalUpdated++;
        } catch (err) {
          // Log but continue on individual failures
          logger.error(`Failed to backfill test case for result ${result.id}: ${String(err)}`);
        }
      }
    }

    return totalUpdated;
  }

  /**
   * Convert to a plain object for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      fingerprint: this.fingerprint,
      description: this.description,
      vars: this.varsJson,
      asserts: this.assertsJson,
      metadata: this.metadataJson,
      sourceType: this.sourceType,
      sourceRef: this.sourceRef,
      sourceRow: this.sourceRow,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
