import { randomUUID } from 'crypto';

import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { getDb, getDbAsync, withTransaction, supportsReturning, shouldUseMysql } from '../database/index';
import { evalResultsTable } from '../database/dynamic-tables';
import { getEnvBool } from '../envars';
import { hashPrompt } from '../prompts/utils';
import { type EvaluateResult } from '../types/index';
import { isApiProvider, isProviderOptions } from '../types/providers';
import { safeJsonStringify } from '../util/json';
import { enhanceMetadataWithProjectInfo } from '../util/projectName';
import { getCurrentTimestamp } from '../util/time';

import type {
  ApiProvider,
  AtomicTestCase,
  GradingResult,
  Prompt,
  ProviderOptions,
  ProviderResponse,
  ResultFailureReason,
} from '../types/index';

// Removes circular references from the provider object and ensures consistent format
export function sanitizeProvider(
  provider: ApiProvider | ProviderOptions | string,
): ProviderOptions {
  try {
    if (isApiProvider(provider)) {
      return {
        id: provider.id(),
        label: provider.label,
        ...(provider.config && {
          config: JSON.parse(safeJsonStringify(provider.config) as string),
        }),
      };
    }
    if (isProviderOptions(provider)) {
      return {
        id: provider.id,
        label: provider.label,
        ...(provider.config && {
          config: JSON.parse(safeJsonStringify(provider.config) as string),
        }),
      };
    }
    if (typeof provider === 'object' && provider) {
      const providerObj = provider as { id: string | (() => string); label?: string; config?: any };
      return {
        id: typeof providerObj.id === 'function' ? providerObj.id() : providerObj.id,
        label: providerObj.label,
        ...(providerObj.config && {
          config: JSON.parse(safeJsonStringify(providerObj.config) as string),
        }),
      };
    }
  } catch {}
  return JSON.parse(safeJsonStringify(provider) as string);
}

export default class EvalResult {
  private static inMemoryStore = new Map<string, EvalResult>();

  private static remember(result: EvalResult) {
    EvalResult.inMemoryStore.set(result.id, result);
  }

  private static rememberMany(results: EvalResult[]) {
    for (const result of results) {
      EvalResult.remember(result);
    }
  }

  private static fromMemoryByEvalId(evalId: string, opts?: { testIdx?: number }) {
    const rows = Array.from(EvalResult.inMemoryStore.values()).filter((row) => row.evalId === evalId);
    return opts?.testIdx == null ? rows : rows.filter((row) => row.testIdx === opts.testIdx);
  }

  private static fromMemoryByEvalAndIndices(evalId: string, testIndices: number[]) {
    const wanted = new Set(testIndices);
    return Array.from(EvalResult.inMemoryStore.values()).filter(
      (row) => row.evalId === evalId && wanted.has(row.testIdx),
    );
  }

  private static completedPairsFromMemory(evalId: string) {
    const ret = new Set<string>();
    for (const row of EvalResult.inMemoryStore.values()) {
      if (row.evalId === evalId) {
        ret.add(`${row.testIdx}:${row.promptIdx}`);
      }
    }
    return ret;
  }

  private static *memoryBatches(evalId: string, batchSize: number) {
    const rows = Array.from(EvalResult.inMemoryStore.values())
      .filter((row) => row.evalId === evalId)
      .sort((a, b) => a.testIdx - b.testIdx);
    for (let i = 0; i < rows.length; i += batchSize) {
      yield rows.slice(i, i + batchSize);
    }
  }

  static async createFromEvaluateResult(
    evalId: string,
    result: EvaluateResult,
    opts?: { persist: boolean },
  ) {
    const persist = opts?.persist == null ? true : opts.persist;
    const {
      prompt,
      error,
      score,
      latencyMs,
      success,
      provider,
      gradingResult,
      namedScores,
      cost,
      metadata,
      failureReason,
      testCase,
    } = result;

    const args = {
      id: randomUUID(),
      evalId,
      testCase: {
        ...testCase,
        ...(testCase.provider && {
          provider: sanitizeProvider(testCase.provider),
        }),
      },
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt,
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: result.response || null,
      gradingResult: gradingResult || null,
      namedScores,
      provider: sanitizeProvider(provider),
      latencyMs,
      cost,
      metadata: enhanceMetadataWithProjectInfo(metadata),
      failureReason,
    };
    
    if (persist) {
      try {
        const db = await getDbAsync();
        if (!db || typeof db.insert !== 'function' || typeof db.select !== 'function') {
          console.warn('Database connection is not properly initialized, creating non-persisted result');
          const fallback = new EvalResult({ ...args, persisted: false });
          EvalResult.remember(fallback);
          return fallback;
        }
        if (supportsReturning()) {
          // SQLite: Use returning
          const dbResult = await db.insert(evalResultsTable).values(args).returning();
          const persistedResult = new EvalResult({ ...dbResult[0], persisted: true });
          EvalResult.remember(persistedResult);
          return persistedResult;
        } else {
          // MySQL: Insert without returning, then fetch
          await db.insert(evalResultsTable).values(args);
          const insertedRecord = await db
            .select()
            .from(evalResultsTable)
            .where(eq(evalResultsTable.id, args.id))
            .limit(1);
          const persistedResult = new EvalResult({ ...insertedRecord[0], persisted: true });
          EvalResult.remember(persistedResult);
          return persistedResult;
        }
      } catch (error) {
        console.warn('Failed to persist result to database:', error);
        const fallback = new EvalResult({ ...args, persisted: false });
        EvalResult.remember(fallback);
        return fallback;
      }
    }
    const evalResult = new EvalResult(args);
    EvalResult.remember(evalResult);
    return evalResult;
  }

  static async createManyFromEvaluateResult(results: EvaluateResult[], evalId: string) {
    const returnResults: EvalResult[] = [];
    try {
      await withTransaction(async (db) => {
        if (!db || typeof db.insert !== 'function' || typeof db.select !== 'function') {
          throw new Error('Database connection is not properly initialized');
        }
        
        for (const result of results) {
          const insertData = { 
            ...result, 
            evalId, 
            id: randomUUID(),
            response: result.response || null,
            gradingResult: result.gradingResult || null,
            namedScores: result.namedScores || {},
            latencyMs: result.latencyMs || 0,
            cost: result.cost || 0,
            metadata: enhanceMetadataWithProjectInfo(result.metadata || {}),
          };
          
          if (supportsReturning()) {
            // SQLite: Use returning
            const dbResult = await db.insert(evalResultsTable).values(insertData).returning();
            const persisted = new EvalResult({ ...dbResult[0], persisted: true });
            EvalResult.remember(persisted);
            returnResults.push(persisted);
          } else {
            // MySQL: Insert without returning, then fetch
            await db.insert(evalResultsTable).values(insertData);
            const insertedRecord = await db
              .select()
              .from(evalResultsTable)
              .where(eq(evalResultsTable.id, insertData.id))
              .limit(1);
            const persisted = new EvalResult({ ...insertedRecord[0], persisted: true });
            EvalResult.remember(persisted);
            returnResults.push(persisted);
          }
        }
      });
    } catch (error) {
      console.warn('Failed to persist results to database, creating non-persisted results:', error);
      // Create non-persisted results as fallback
      for (const result of results) {
        const fallback = new EvalResult({
          ...result,
          evalId,
          id: randomUUID(),
          response: result.response || null,
          gradingResult: result.gradingResult || null,
          namedScores: result.namedScores || {},
          latencyMs: result.latencyMs || 0,
          cost: result.cost || 0,
          metadata: enhanceMetadataWithProjectInfo(result.metadata || {}),
          persisted: false,
        });
        EvalResult.remember(fallback);
        returnResults.push(fallback);
      }
    }
    return returnResults;
  }

  static async findById(id: string) {
    try {
      const db = await getDbAsync();
      if (!db || typeof db.select !== 'function') {
        console.warn('Database connection is not properly initialized');
        return EvalResult.inMemoryStore.get(id) ?? null;
      }
      const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
      if (result.length === 0) {
        return null;
      }
      const evalResult = new EvalResult({ ...result[0], persisted: true });
      EvalResult.remember(evalResult);
      return evalResult;
    } catch (error) {
      console.warn('Failed to find result by ID:', error);
      return EvalResult.inMemoryStore.get(id) ?? null;
    }
  }

  static async findManyByEvalId(evalId: string, opts?: { testIdx?: number }) {
    try {
      const db = await getDbAsync();
      if (!db || typeof db.select !== 'function') {
        console.warn('Database connection is not properly initialized');
        return EvalResult.fromMemoryByEvalId(evalId, opts);
      }
      const rows = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            opts?.testIdx == null ? undefined : eq(evalResultsTable.testIdx, opts.testIdx),
          ),
        );
      const evalResults = rows.map((row: any) => new EvalResult({ ...row, persisted: true }));
      EvalResult.rememberMany(evalResults);
      return evalResults;
    } catch (error) {
      console.warn('Failed to find results by eval ID:', error);
      return EvalResult.fromMemoryByEvalId(evalId, opts);
    }
  }

  static async findManyByEvalIdAndTestIndices(evalId: string, testIndices: number[]) {
    if (!testIndices.length) {
      return [];
    }
    try {
      const db = await getDbAsync();
      if (!db || typeof db.select !== 'function') {
        console.warn('Database connection is not properly initialized');
        return EvalResult.fromMemoryByEvalAndIndices(evalId, testIndices);
      }
      const rows = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            testIndices.length === 1
              ? eq(evalResultsTable.testIdx, testIndices[0])
              : inArray(evalResultsTable.testIdx, testIndices),
          ),
        );
      const evalResults = rows.map((row: any) => new EvalResult({ ...row, persisted: true }));
      EvalResult.rememberMany(evalResults);
      return evalResults;
    } catch (error) {
      console.warn('Failed to find results by eval ID and test indices:', error);
      return EvalResult.fromMemoryByEvalAndIndices(evalId, testIndices);
    }
  }

  /**
   * Returns a set of completed (testIdx,promptIdx) pairs for a given eval.
   * Key format: `${testIdx}:${promptIdx}`
   */
  static async getCompletedIndexPairs(evalId: string): Promise<Set<string>> {
    try {
      const db = await getDbAsync();
      if (!db || typeof db.select !== 'function') {
        console.warn('Database connection is not properly initialized');
        return EvalResult.completedPairsFromMemory(evalId);
      }
      const rows = await db
        .select({ testIdx: evalResultsTable.testIdx, promptIdx: evalResultsTable.promptIdx })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, evalId));
      const ret = new Set<string>();
      for (const r of rows) {
        ret.add(`${r.testIdx}:${r.promptIdx}`);
      }
      return ret;
    } catch (error) {
      console.warn('Failed to get completed index pairs:', error);
      return EvalResult.completedPairsFromMemory(evalId);
    }
  }

  // This is a generator that yields batches of results from the database
  // These are batched by test Id, not just results to ensure we get all results for a given test
  static async *findManyByEvalIdBatched(
    evalId: string,
    opts?: {
      batchSize?: number;
    },
  ): AsyncGenerator<EvalResult[]> {
    try {
      const db = await getDbAsync();
      if (!db || typeof db.select !== 'function') {
        console.warn('Database connection is not properly initialized');
        const batchSize = opts?.batchSize || 100;
        yield* EvalResult.memoryBatches(evalId, batchSize);
        return;
      }
      const batchSize = opts?.batchSize || 100;
      let offset = 0;

      while (true) {
        const results = await db
          .select()
          .from(evalResultsTable)
          .where(
            and(
              eq(evalResultsTable.evalId, evalId),
              gte(evalResultsTable.testIdx, offset),
              lt(evalResultsTable.testIdx, offset + batchSize),
            ),
          )
          .all();

        if (results.length === 0) {
          break;
        }

        const evalResults = results.map((result: any) => new EvalResult({ ...result, persisted: true }));
        EvalResult.rememberMany(evalResults);
        yield evalResults;
        offset += batchSize;
      }
    } catch (error) {
      console.warn('Failed to find results in batches:', error);
      const batchSize = opts?.batchSize || 100;
      yield* EvalResult.memoryBatches(evalId, batchSize);
    }
  }

  /**
   * Find evaluation results by project name
   * This allows filtering results in the dashboard by project
   */
  static async findManyByProjectName(projectName: string, opts?: { 
    limit?: number; 
    offset?: number;
    evalId?: string;
  }): Promise<EvalResult[]> {
    try {
      const usingMysql = shouldUseMysql();
      const db = usingMysql ? await getDbAsync() : getDb();
      if (!db || typeof db.select !== 'function') {
        console.warn('Database connection is not properly initialized');
        // Fallback to in-memory search
        const allResults = Array.from(EvalResult.inMemoryStore.values());
        return allResults.filter(result => 
          result.metadata.projectName === projectName &&
          (!opts?.evalId || result.evalId === opts.evalId)
        ).slice(opts?.offset || 0, (opts?.offset || 0) + (opts?.limit || 100));
      }

      // MySQL returns quoted JSON strings, SQLite returns unquoted values
      const projectNameExpr = usingMysql
        ? sql`JSON_UNQUOTE(JSON_EXTRACT(${evalResultsTable.metadata}, '$.projectName'))`
        : sql`json_extract(${evalResultsTable.metadata}, '$.projectName')`;
      
      const whereConditions = [eq(projectNameExpr, projectName)];

      if (opts?.evalId) {
        whereConditions.push(eq(evalResultsTable.evalId, opts.evalId));
      }

      let query = db
        .select()
        .from(evalResultsTable)
        .where(and(...whereConditions));

      if (opts?.limit) {
        query = query.limit(opts.limit);
      }
      if (opts?.offset) {
        query = query.offset(opts.offset);
      }

      const rows = usingMysql ? await query : query.all();
      const evalResults = rows.map((row: any) => new EvalResult({ ...row, persisted: true }));
      EvalResult.rememberMany(evalResults);
      return evalResults;
    } catch (error) {
      console.warn('Failed to find results by project name:', error);
      // Fallback to in-memory search
      const allResults = Array.from(EvalResult.inMemoryStore.values());
      return allResults.filter(result => 
        result.metadata.projectName === projectName &&
        (!opts?.evalId || result.evalId === opts.evalId)
      ).slice(opts?.offset || 0, (opts?.offset || 0) + (opts?.limit || 100));
    }
  }

  /**
   * Get all unique project names from stored evaluation results
   */
  static async getProjectNames(): Promise<string[]> {
    try {
      const usingMysql = shouldUseMysql();
      const db = usingMysql ? await getDbAsync() : getDb();
      if (!db || typeof db.select !== 'function') {
        console.warn('Database connection is not properly initialized');
        // Fallback to in-memory search
        const allResults = Array.from(EvalResult.inMemoryStore.values());
        const projectNames = new Set<string>();
        allResults.forEach(result => {
          if (result.metadata.projectName) {
            projectNames.add(result.metadata.projectName);
          }
        });
        return Array.from(projectNames);
      }

      // MySQL returns quoted JSON strings, SQLite returns unquoted values
      const projectNameExpr = usingMysql
        ? sql`JSON_UNQUOTE(JSON_EXTRACT(${evalResultsTable.metadata}, '$.projectName'))`
        : sql`json_extract(${evalResultsTable.metadata}, '$.projectName')`;
      
      const query = db
        .selectDistinct({ projectName: projectNameExpr })
        .from(evalResultsTable)
        .where(
          usingMysql
            ? sql`JSON_UNQUOTE(JSON_EXTRACT(${evalResultsTable.metadata}, '$.projectName')) IS NOT NULL`
            : sql`json_extract(${evalResultsTable.metadata}, '$.projectName') IS NOT NULL`,
        );
      
      const rows = usingMysql ? await query : query.all();

      return rows
        .map((row: any) => row.projectName as string)
        .filter((name: string) => name && name !== 'null');
    } catch (error) {
      console.warn('Failed to get project names:', error);
      // Fallback to in-memory search
      const allResults = Array.from(EvalResult.inMemoryStore.values());
      const projectNames = new Set<string>();
      allResults.forEach(result => {
        if (result.metadata.projectName) {
          projectNames.add(result.metadata.projectName);
        }
      });
      return Array.from(projectNames);
    }
  }

  id: string;
  evalId: string;
  description?: string | null;
  promptIdx: number;
  testIdx: number;
  testCase: AtomicTestCase;
  prompt: Prompt;
  promptId: string;
  error?: string | null;
  success: boolean;
  score: number;
  response: ProviderResponse | undefined;
  gradingResult: GradingResult | null;
  namedScores: Record<string, number>;
  provider: ProviderOptions;
  latencyMs: number;
  cost: number;
  metadata: Record<string, any>;
  failureReason: ResultFailureReason;
  persisted: boolean;
  pluginId?: string;

  constructor(opts: {
    id: string;
    evalId: string;
    promptIdx: number;
    testIdx: number;
    testCase: AtomicTestCase;
    prompt: Prompt;
    promptId?: string | null;
    error?: string | null;
    success: boolean;
    score: number;
    response: ProviderResponse | null;
    gradingResult: GradingResult | null;
    namedScores?: Record<string, number> | null;
    provider: ProviderOptions;
    latencyMs?: number | null;
    cost?: number | null;
    metadata?: Record<string, any> | null;
    failureReason: ResultFailureReason;
    persisted?: boolean;
  }) {
    this.id = opts.id;
    this.evalId = opts.evalId;

    this.promptIdx = opts.promptIdx;
    this.testIdx = opts.testIdx;
    this.testCase = opts.testCase;
    this.prompt = opts.prompt;
    this.promptId = opts.promptId || hashPrompt(opts.prompt);
    this.error = opts.error;
    this.score = opts.score;
    this.success = opts.success;
    this.response = opts.response || undefined;
    this.gradingResult = opts.gradingResult;
    this.namedScores = opts.namedScores || {};
    this.provider = opts.provider;
    this.latencyMs = opts.latencyMs || 0;
    this.cost = opts.cost || 0;
    this.metadata = opts.metadata || {};
    this.failureReason = opts.failureReason;
    this.persisted = opts.persisted || false;
    this.pluginId = opts.testCase.metadata?.pluginId;
  }

  async save() {
    try {
      const db = await getDbAsync();
      if (!db || typeof db.insert !== 'function' || typeof db.update !== 'function') {
        console.warn('Database connection is not properly initialized, cannot save result');
        EvalResult.remember(this);
        return;
      }
      if (this.persisted) {
        await db
          .update(evalResultsTable)
          .set({ ...this, updatedAt: getCurrentTimestamp() })
          .where(eq(evalResultsTable.id, this.id));
      } else {
        if (supportsReturning()) {
          // SQLite: Use returning
          const result = await db.insert(evalResultsTable).values(this).returning();
          this.id = result[0].id;
        } else {
          // MySQL: Insert without returning
          await db.insert(evalResultsTable).values(this);
        }
        this.persisted = true;
      }
    } catch (error) {
      console.warn('Failed to save result:', error);
    } finally {
      EvalResult.remember(this);
    }
  }

  toEvaluateResult(): EvaluateResult {
    const shouldStripPromptText = getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false);
    const shouldStripResponseOutput = getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false);
    const shouldStripTestVars = getEnvBool('PROMPTFOO_STRIP_TEST_VARS', false);
    const shouldStripGradingResult = getEnvBool('PROMPTFOO_STRIP_GRADING_RESULT', false);
    const shouldStripMetadata = getEnvBool('PROMPTFOO_STRIP_METADATA', false);

    const response =
      shouldStripResponseOutput && this.response
        ? {
            ...this.response,
            output: '[output stripped]',
          }
        : this.response;

    const prompt = shouldStripPromptText
      ? {
          ...this.prompt,
          raw: '[prompt stripped]',
        }
      : this.prompt;

    const testCase = shouldStripTestVars
      ? {
          ...this.testCase,
          vars: undefined,
        }
      : this.testCase;

    return {
      cost: this.cost,
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult ? null : this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      provider: { id: this.provider.id, label: this.provider.label },
      response,
      score: this.score,
      success: this.success,
      testCase,
      testIdx: this.testIdx,
      vars: shouldStripTestVars ? {} : this.testCase.vars || {},
      metadata: shouldStripMetadata ? {} : this.metadata,
      failureReason: this.failureReason,
    };
  }
}

