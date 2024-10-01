import { and, desc, eq, like, sql } from 'drizzle-orm';
import invariant from 'tiny-invariant';
import { DEFAULT_QUERY_LIMIT } from '../constants';
import { getDb } from '../database';
import {
  datasets,
  evals as evalsTable,
  evalsToDatasets,
  evalsToPrompts,
  prompts as promptsTable,
  tags as tagsTable,
  evalsToTags,
  testCaseResults,
  evalsToProviders,
} from '../database/tables';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import type {
  AtomicTestCase,
  CompletedPrompt,
  EvaluateResult,
  EvaluateStats,
  EvaluateSummary,
  EvaluateTable,
  EvaluateTableRow,
  Prompt,
  ResultsFile,
  TokenUsage,
  UnifiedConfig,
} from '../types';
import { sha256 } from '../util/createHash';
import type Provider from './provider';
import TestCaseResult from './test_case_result';

export function getEvalId(createdAt: Date = new Date()) {
  return `eval-${createdAt.toISOString().slice(0, 19)}`;
}

export default class Eval {
  id: string;
  createdAt: number;
  author?: string;
  description?: string;
  config: Partial<UnifiedConfig>;
  results: TestCaseResult[];
  datasetId?: string;
  prompts: CompletedPrompt[];
  oldResults?: EvaluateSummary;

  static async summaryResults(
    limit: number = DEFAULT_QUERY_LIMIT,
    filterDescription?: string,
    datasetId?: string,
  ) {
    const db = getDb();
    const startTime = performance.now();
    const query = db
      .select({
        evalId: evalsTable.id,
        createdAt: evalsTable.createdAt,
        description: evalsTable.description,
        numTests: sql`MAX(${testCaseResults.testCaseIdx} + 1)`.as('numTests'),
        datasetId: evalsToDatasets.datasetId,
      })
      .from(evalsTable)
      .leftJoin(evalsToDatasets, eq(evalsTable.id, evalsToDatasets.evalId))
      .leftJoin(testCaseResults, eq(evalsTable.id, testCaseResults.evalId))
      .where(
        and(
          datasetId ? eq(evalsToDatasets.datasetId, datasetId) : undefined,
          filterDescription ? like(evalsTable.description, `%${filterDescription}%`) : undefined,
        ),
      )
      .groupBy(evalsTable.id);

    const results = query.orderBy(desc(evalsTable.createdAt)).limit(limit).all();

    const mappedResults = results.map((result) => ({
      evalId: result.evalId,
      createdAt: result.createdAt,
      description: result.description,
      numTests: result.numTests || 0,
      datasetId: result.datasetId,
    }));

    const endTime = performance.now();
    const executionTime = endTime - startTime;
    logger.debug(`listPreviousResults execution time: ${executionTime.toFixed(2)}ms`);

    return mappedResults;
  }

  static async latest() {
    const db = getDb();
    const db_results = await db
      .select({
        id: evalsTable.id,
      })
      .from(evalsTable)
      .orderBy(desc(evalsTable.createdAt))
      .limit(1);

    if (db_results.length === 0) {
      return undefined;
    }

    return await Eval.findById(db_results[0].id);
  }

  static async findById(id: string) {
    const db = getDb();

    const [evals, results] = await Promise.all([
      db.select().from(evalsTable).where(eq(evalsTable.id, id)),
      db.select().from(testCaseResults).where(eq(testCaseResults.evalId, id)).execute(),

      db
        .select({
          id: promptsTable.id,
          prompt: promptsTable.prompt,
        })
        .from(evalsToPrompts)
        .leftJoin(promptsTable, eq(evalsToPrompts.promptId, promptsTable.id))
        .where(eq(evalsToPrompts.evalId, id))
        .execute(),
    ]);

    if (evals.length === 0) {
      return undefined;
    }
    const eval_ = evals[0];

    const evalInstance = new Eval(eval_.config, {
      id: eval_.id,
      createdAt: new Date(eval_.createdAt),
      author: eval_.author || undefined,
      description: eval_.description || undefined,
      prompts: eval_.prompts || [],
    });
    if (results.length > 0) {
      evalInstance.results = results.map((r) => new TestCaseResult(r));
    } else {
      evalInstance.oldResults = eval_.results as EvaluateSummary;
    }

    return evalInstance;
  }

  static create(
    config: Partial<UnifiedConfig>,
    renderedPrompts: Prompt[], // The config doesn't contain the actual prompts, so we need to pass them in separately
    opts?: {
      id?: string;
      createdAt?: Date;
      author?: string;
    },
  ) {
    const createdAt = opts?.createdAt || new Date();
    const evalId = opts?.id || getEvalId(createdAt);
    const db = getDb();
    db.transaction((tx) => {
      tx.insert(evalsTable)
        .values({
          id: evalId,
          createdAt: createdAt.getTime(),
          author: opts?.author,
          description: config.description,
          config,
          results: {},
        })
        .run();

      for (const prompt of renderedPrompts) {
        const label = prompt.label || prompt.display || prompt.raw;
        const promptId = hashPrompt(prompt);

        tx.insert(promptsTable)
          .values({
            id: promptId,
            prompt: label,
          })
          .onConflictDoNothing()
          .run();

        tx.insert(evalsToPrompts)
          .values({
            evalId,
            promptId,
          })
          .onConflictDoNothing()
          .run();

        logger.debug(`Inserting prompt ${promptId}`);
      }

      // Record dataset relation
      const datasetId = sha256(JSON.stringify(config.tests || []));
      tx.insert(datasets)
        .values({
          id: datasetId,
          tests: config.tests,
        })
        .onConflictDoNothing()
        .run();

      tx.insert(evalsToDatasets)
        .values({
          evalId,
          datasetId,
        })
        .onConflictDoNothing()
        .run();

      logger.debug(`Inserting dataset ${datasetId}`);

      // Record tags
      if (config.tags) {
        for (const [tagKey, tagValue] of Object.entries(config.tags)) {
          const tagId = sha256(`${tagKey}:${tagValue}`);

          tx.insert(tagsTable)
            .values({
              id: tagId,
              name: tagKey,
              value: tagValue,
            })
            .onConflictDoNothing()
            .run();

          tx.insert(evalsToTags)
            .values({
              evalId,
              tagId,
            })
            .onConflictDoNothing()
            .run();

          logger.debug(`Inserting tag ${tagId}`);
        }
      }
    });
    return new Eval(config, { id: evalId, author: opts?.author, createdAt });
  }

  constructor(
    config: Partial<UnifiedConfig>,
    opts?: {
      id?: string;
      createdAt?: Date;
      author?: string;
      description?: string;
      prompts?: CompletedPrompt[];
    },
  ) {
    const createdAt = opts?.createdAt || new Date();
    this.createdAt = createdAt.getTime();
    this.id = opts?.id || getEvalId(createdAt);
    this.author = opts?.author;
    this.config = config;
    this.results = [];
    this.prompts = opts?.prompts || [];
  }

  isVersion1() {
    return this.oldResults && 'table' in this.oldResults;
  }

  async addResult(result: EvaluateResult, columnIdx: number, rowIdx: number, test: AtomicTestCase) {
    const newResult = await TestCaseResult.create(this.id, result, columnIdx, rowIdx, test);
    this.results.push(newResult);
  }

  async addPrompts(prompts: CompletedPrompt[]) {
    this.prompts = prompts;
    const db = getDb();
    await db.update(evalsTable).set({ prompts }).where(eq(evalsTable.id, this.id)).run();
  }

  async addProviders(providers: Provider[]) {
    const db = getDb();
    await db.transaction(async (tx) => {
      for (const provider of providers) {
        const id = provider.id;
        console.log({ id, evalId: this.id });
        tx.insert(evalsToProviders)
          .values({
            evalId: this.id,
            providerId: id,
          })
          .onConflictDoNothing()
          .run();
      }
    });
  }

  async loadResults() {
    this.results = await TestCaseResult.findManyByEvalId(this.id);
  }

  async toEvaluateSummary(): Promise<EvaluateSummary> {
    if (this.isVersion1()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults;
    }
    if (this.results.length === 0) {
      await this.loadResults();
    }
    const stats: EvaluateStats = {
      successes: 0,
      failures: 0,
      tokenUsage: {
        cached: 0,
        completion: 0,
        prompt: 0,
        total: 0,
      },
    };

    for (const prompt of this.prompts) {
      stats.successes += prompt.metrics?.testPassCount || 0;
      stats.failures += prompt.metrics?.testFailCount || 0;
      stats.tokenUsage.prompt += prompt.metrics?.tokenUsage.prompt || 0;
      stats.tokenUsage.cached += prompt.metrics?.tokenUsage.cached || 0;
      stats.tokenUsage.completion += prompt.metrics?.tokenUsage.completion || 0;
      stats.tokenUsage.total += prompt.metrics?.tokenUsage.total || 0;
    }
    return {
      timestamp: new Date(this.createdAt).toISOString(),
      results: this.results.map((r) => r.toEvaluateResult()),
      stats,
    };
  }

  async toResultsFile(): Promise<ResultsFile> {
    const summary = await this.toEvaluateSummary();
    return {
      version: 3,
      createdAt: new Date(this.createdAt).toISOString(),
      results: summary,
      config: this.config,
      author: this.author || null,
      prompts: this.prompts,
      datasetId: this.datasetId || null,
    };
  }
}

class PromptMetrics {
  score: number;
  testPassCount: number;
  testFailCount: number;
  assertPassCount: number;
  assertFailCount: number;
  totalLatencyMs: number;
  tokenUsage: TokenUsage;
  namedScores: Record<string, number>;
  namedScoresCount: Record<string, number>;
  cost: number;

  constructor() {
    this.score = 0;
    this.testPassCount = 0;
    this.testFailCount = 0;
    this.assertPassCount = 0;
    this.assertFailCount = 0;
    this.totalLatencyMs = 0;
    this.tokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
    };
    this.namedScores = {};
    this.namedScoresCount = {};
    this.cost = 0;
  }
}

export function convertResultsToTable(eval_: ResultsFile): EvaluateTable {
  invariant(
    eval_.prompts,
    `Prompts are required in this version of the results file, this needs to be results file version >= 4, version: ${eval_.version}`,
  );
  // first we need to get our prompts, we can get that from any of the results in each column
  const results = eval_.results;
  const rows: EvaluateTableRow[] = [];
  const completedPrompts: Record<string, CompletedPrompt> = {};
  const varsForHeader = new Set<string>();
  const varValuesForRow = new Map<number, Record<string, string>>();
  for (const result of results.results) {
    // vars
    for (const varName of Object.keys(result.vars || {})) {
      varsForHeader.add(varName);
    }
    let row = rows[result.testCaseIdx];
    if (!row) {
      rows[result.testCaseIdx] = {
        description: result.description || undefined,
        outputs: [],
        vars: result.vars
          ? Object.values(varsForHeader)
              .map((varName) => {
                const varValue = result.vars?.[varName] || '';
                if (typeof varValue === 'string') {
                  return varValue;
                }
                return JSON.stringify(varValue);
              })
              .flat()
          : [],
        test: {},
      };
      varValuesForRow.set(result.testCaseIdx, result.vars as Record<string, string>);
      row = rows[result.testCaseIdx];
    }

    // format text
    let resultText: string | undefined;
    const outputTextDisplay = (
      typeof result.response?.output === 'object'
        ? JSON.stringify(result.response.output)
        : result.response?.output || result.error || ''
    ) as string;
    if (result.testCase.assert) {
      if (result.success) {
        resultText = `${outputTextDisplay || result.error || ''}`;
      } else {
        resultText = `${result.error}\n---\n${outputTextDisplay}`;
      }
    } else if (result.error) {
      resultText = `${result.error}`;
    } else {
      resultText = outputTextDisplay;
    }

    row.outputs[result.promptIdx] = {
      id: `${result.testCaseIdx}-${result.promptIdx}`,
      ...result,
      text: resultText || '',
      prompt: result.prompt.raw,
      provider: result.provider?.label || result.provider?.id || 'unknown provider',
      pass: result.success,
      cost: result.cost || 0,
    };
    invariant(result.promptId, 'Prompt ID is required');
    const completedPromptId = `${result.promptId}-${JSON.stringify(result.provider)}`;
    if (!completedPrompts[completedPromptId]) {
      completedPrompts[completedPromptId] = {
        ...result.prompt,
        provider: result.provider?.label || result.provider?.id || 'unknown provider',
        metrics: new PromptMetrics(),
      };
    }
    const prompt = completedPrompts[completedPromptId];
    invariant(prompt.metrics, 'Prompt metrics are required');
    prompt.metrics.score += result.score;
    prompt.metrics.testPassCount += result.success ? 1 : 0;
    prompt.metrics.testFailCount += result.success ? 0 : 1;
    prompt.metrics.assertPassCount +=
      result.gradingResult?.componentResults?.filter((r) => r.pass).length || 0;
    prompt.metrics.assertFailCount +=
      result.gradingResult?.componentResults?.filter((r) => !r.pass).length || 0;
    prompt.metrics.totalLatencyMs += result.latencyMs || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.cached += result.providerResponse?.tokenUsage?.cached || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.completion += result.providerResponse?.tokenUsage?.completion || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.prompt += result.providerResponse?.tokenUsage?.prompt || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.total += result.providerResponse?.tokenUsage?.total || 0;
    prompt.metrics.cost += result.cost || 0;
    prompt.metrics.namedScores = eval_.prompts[result.promptIdx]?.metrics?.namedScores || {};
    prompt.metrics.namedScoresCount =
      eval_.prompts[result.promptIdx]?.metrics?.namedScoresCount || {};
  }

  const sortedVars = [...varsForHeader].sort();
  for (const [rowIdx, row] of rows.entries()) {
    row.vars = sortedVars.map((varName) => varValuesForRow.get(rowIdx)?.[varName] || '');
  }
  return {
    head: {
      prompts: Object.values(completedPrompts),
      vars: [...varsForHeader].sort(),
    },
    body: rows,
  };
}
