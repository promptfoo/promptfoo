import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  type AtomicTestCase,
  type CompletedPrompt,
  type EvaluateSummaryV2,
  type GradingResult,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
  type UnifiedConfig,
} from '../types/index';

import type { ModelAuditScanResults } from '../types/modelAudit';

// ------------ Prompts ------------

export const promptsTable = mysqlTable(
  'prompts',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    prompt: text('prompt').notNull(),
  },
  (table) => ({
    createdAtIdx: index('prompts_created_at_idx').on(table.createdAt),
  }),
);

// ------------ Tags ------------

export const tagsTable = mysqlTable(
  'tags',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    nameIdx: index('tags_name_idx').on(table.name),
    uniqueNameValue: uniqueIndex('tags_name_value_unique').on(table.name, table.value),
  }),
);

// ------------ Evals ------------

export const evalsTable = mysqlTable(
  'evals',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    author: varchar('author', { length: 255 }),
    description: text('description'),
    results: json('results').$type<EvaluateSummaryV2 | object>().notNull(),
    config: json('config').$type<Partial<UnifiedConfig>>().notNull(),
    prompts: json('prompts').$type<CompletedPrompt[]>(),
    vars: json('vars').$type<string[]>(),
    runtimeOptions: json('runtime_options').$type<
      Partial<import('../types').EvaluateOptions>
    >(),
    isRedteam: boolean('is_redteam').notNull().default(false),
  },
  (table) => ({
    createdAtIdx: index('evals_created_at_idx').on(table.createdAt),
    authorIdx: index('evals_author_idx').on(table.author),
    isRedteamIdx: index('evals_is_redteam_idx').on(table.isRedteam),
  }),
);

export const evalResultsTable = mysqlTable(
  'eval_results',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    evalId: varchar('eval_id', { length: 255 })
      .notNull()
      .references(() => evalsTable.id),
    promptIdx: int('prompt_idx').notNull(),
    testIdx: int('test_idx').notNull(),

    testCase: json('test_case').$type<AtomicTestCase>().notNull(),
    prompt: json('prompt').$type<Prompt>().notNull(),
    promptId: varchar('prompt_id', { length: 255 }).references(() => promptsTable.id),

    // Provider-related fields
    provider: json('provider').$type<ProviderOptions>().notNull(),

    latencyMs: int('latency_ms'),
    cost: decimal('cost', { precision: 10, scale: 6 }),

    // Output-related fields
    response: json('response').$type<ProviderResponse>(),
    error: text('error'),
    failureReason: int('failure_reason').default(ResultFailureReason.NONE).notNull(),

    // Result-related fields
    success: boolean('success').notNull(),
    score: decimal('score', { precision: 5, scale: 4 }).notNull(),
    gradingResult: json('grading_result').$type<GradingResult>(),
    namedScores: json('named_scores').$type<Record<string, number>>(),

    // Metadata fields
    metadata: json('metadata').$type<Record<string, string>>(),
  },
  (table) => ({
    evalIdIdx: index('eval_result_eval_id_idx').on(table.evalId),
    testIdxIdx: index('eval_result_test_idx').on(table.testIdx),

    evalTestIdx: index('eval_result_eval_test_idx').on(table.evalId, table.testIdx),
    evalSuccessIdx: index('eval_result_eval_success_idx').on(table.evalId, table.success),
    evalFailureIdx: index('eval_result_eval_failure_idx').on(table.evalId, table.failureReason),
    evalTestSuccessIdx: index('eval_result_eval_test_success_idx').on(
      table.evalId,
      table.testIdx,
      table.success,
    ),
  }),
);

export const evalsToPromptsTable = mysqlTable(
  'evals_to_prompts',
  {
    evalId: varchar('eval_id', { length: 255 })
      .notNull()
      .references(() => evalsTable.id, { onDelete: 'cascade' }),
    promptId: varchar('prompt_id', { length: 255 })
      .notNull()
      .references(() => promptsTable.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.promptId] }),
    evalIdIdx: index('evals_to_prompts_eval_id_idx').on(t.evalId),
    promptIdIdx: index('evals_to_prompts_prompt_id_idx').on(t.promptId),
  }),
);

export const promptsRelations = relations(promptsTable, ({ many }) => ({
  evalsToPrompts: many(evalsToPromptsTable),
}));

export const evalsToTagsTable = mysqlTable(
  'evals_to_tags',
  {
    evalId: varchar('eval_id', { length: 255 })
      .notNull()
      .references(() => evalsTable.id),
    tagId: varchar('tag_id', { length: 255 })
      .notNull()
      .references(() => tagsTable.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.tagId] }),
    evalIdIdx: index('evals_to_tags_eval_id_idx').on(t.evalId),
    tagIdIdx: index('evals_to_tags_tag_id_idx').on(t.tagId),
  }),
);

export const tagsRelations = relations(tagsTable, ({ many }) => ({
  evalsToTags: many(evalsToTagsTable),
}));

export const evalsToTagsRelations = relations(evalsToTagsTable, ({ one }) => ({
  eval: one(evalsTable, {
    fields: [evalsToTagsTable.evalId],
    references: [evalsTable.id],
  }),
  tag: one(tagsTable, {
    fields: [evalsToTagsTable.tagId],
    references: [tagsTable.id],
  }),
}));

// ------------ Datasets ------------

export const datasetsTable = mysqlTable(
  'datasets',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tests: json('tests').$type<UnifiedConfig['tests']>(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index('datasets_created_at_idx').on(table.createdAt),
  }),
);

export const evalsToDatasetsTable = mysqlTable(
  'evals_to_datasets',
  {
    evalId: varchar('eval_id', { length: 255 })
      .notNull()
      .references(() => evalsTable.id),
    datasetId: varchar('dataset_id', { length: 255 })
      .notNull()
      .references(() => datasetsTable.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.datasetId] }),
    evalIdIdx: index('evals_to_datasets_eval_id_idx').on(t.evalId),
    datasetIdIdx: index('evals_to_datasets_dataset_id_idx').on(t.datasetId),
  }),
);

export const datasetsRelations = relations(datasetsTable, ({ many }) => ({
  evalsToDatasets: many(evalsToDatasetsTable),
}));

// ------------ Evals ------------

export const evalsRelations = relations(evalsTable, ({ many }) => ({
  evalsToPrompts: many(evalsToPromptsTable),
  evalsToDatasets: many(evalsToDatasetsTable),
  evalsToTags: many(evalsToTagsTable),
}));

export const evalsToPromptsRelations = relations(evalsToPromptsTable, ({ one }) => ({
  eval: one(evalsTable, {
    fields: [evalsToPromptsTable.evalId],
    references: [evalsTable.id],
  }),
  prompt: one(promptsTable, {
    fields: [evalsToPromptsTable.promptId],
    references: [promptsTable.id],
  }),
}));

export const evalsToDatasetsRelations = relations(evalsToDatasetsTable, ({ one }) => ({
  eval: one(evalsTable, {
    fields: [evalsToDatasetsTable.evalId],
    references: [evalsTable.id],
  }),
  dataset: one(datasetsTable, {
    fields: [evalsToDatasetsTable.datasetId],
    references: [datasetsTable.id],
  }),
}));

// ------------ Configs ------------

export const configsTable = mysqlTable(
  'configs',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 100 }).notNull(), // e.g. 'redteam', 'eval', etc.
    config: json('config').notNull(),
  },
  (table) => ({
    createdAtIdx: index('configs_created_at_idx').on(table.createdAt),
    typeIdx: index('configs_type_idx').on(table.type),
  }),
);

// ------------ Model Audits ------------

export const modelAuditsTable = mysqlTable(
  'model_audits',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),

    // Basic audit information
    name: varchar('name', { length: 255 }), // Optional name/identifier for the audit
    author: varchar('author', { length: 255 }), // Optional author/user who ran the audit
    modelPath: text('model_path').notNull(), // Path to the model/file being audited
    modelType: varchar('model_type', { length: 100 }), // Optional: type of model (e.g., 'pytorch', 'tensorflow', etc.)

    // Audit results as JSON blob
    results: json('results').$type<ModelAuditScanResults>().notNull(),

    // Extracted checks and issues from results for easier querying
    checks: json('checks').$type<ModelAuditScanResults['checks']>(),
    issues: json('issues').$type<ModelAuditScanResults['issues']>(),

    // Summary fields for quick filtering/querying
    hasErrors: boolean('has_errors').notNull(),
    totalChecks: int('total_checks'),
    passedChecks: int('passed_checks'),
    failedChecks: int('failed_checks'),

    // Optional metadata
    metadata: json('metadata').$type<Record<string, any>>(),
  },
  (table) => ({
    createdAtIdx: index('model_audits_created_at_idx').on(table.createdAt),
    modelPathIdx: index('model_audits_model_path_idx').on(table.modelPath),
    hasErrorsIdx: index('model_audits_has_errors_idx').on(table.hasErrors),
    modelTypeIdx: index('model_audits_model_type_idx').on(table.modelType),
  }),
);

// ------------ Traces ------------

export const tracesTable = mysqlTable(
  'traces',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    traceId: varchar('trace_id', { length: 255 }).notNull().unique(),
    evaluationId: varchar('evaluation_id', { length: 255 })
      .notNull()
      .references(() => evalsTable.id),
    testCaseId: varchar('test_case_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    metadata: json('metadata').$type<Record<string, any>>(),
  },
  (table) => ({
    evaluationIdx: index('traces_evaluation_idx').on(table.evaluationId),
    traceIdIdx: index('traces_trace_id_idx').on(table.traceId),
  }),
);

export const spansTable = mysqlTable(
  'spans',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    traceId: varchar('trace_id', { length: 255 })
      .notNull()
      .references(() => tracesTable.traceId),
    spanId: varchar('span_id', { length: 255 }).notNull(),
    parentSpanId: varchar('parent_span_id', { length: 255 }),
    name: varchar('name', { length: 255 }).notNull(),
    startTime: bigint('start_time', { mode: 'number' }).notNull(),
    endTime: bigint('end_time', { mode: 'number' }),
    attributes: json('attributes').$type<Record<string, any>>(),
    statusCode: int('status_code'),
    statusMessage: text('status_message'),
  },
  (table) => ({
    traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
    spanIdIdx: index('spans_span_id_idx').on(table.spanId),
  }),
);

// ------------ Trace Relations ------------

export const tracesRelations = relations(tracesTable, ({ one, many }) => ({
  eval: one(evalsTable, {
    fields: [tracesTable.evaluationId],
    references: [evalsTable.id],
  }),
  spans: many(spansTable),
}));

export const spansRelations = relations(spansTable, ({ one }) => ({
  trace: one(tracesTable, {
    fields: [spansTable.traceId],
    references: [tracesTable.traceId],
  }),
}));