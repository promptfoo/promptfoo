import { relations, sql } from 'drizzle-orm';
import {
  text,
  integer,
  sqliteTable,
  primaryKey,
  index,
  uniqueIndex,
  real,
} from 'drizzle-orm/sqlite-core';
import {
  type Prompt,
  type ProviderResponse,
  type GradingResult,
  type UnifiedConfig,
  type ProviderOptions,
  type AtomicTestCase,
  type CompletedPrompt,
  type EvaluateSummaryV2,
  ResultFailureReason,
} from '../types';

// ------------ Prompts ------------

export const promptsTable = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    prompt: text('prompt').notNull(),
  },
  (table) => ({
    createdAtIdx: index('prompts_created_at_idx').on(table.createdAt),
  }),
);

// ------------ Tags ------------

export const tagsTable = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    nameIdx: index('tags_name_idx').on(table.name),
    uniqueNameValue: uniqueIndex('tags_name_value_unique').on(table.name, table.value),
  }),
);

// ------------ Evals ------------

export const evalsTable = sqliteTable(
  'evals',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    author: text('author'),
    description: text('description'),
    results: text('results', { mode: 'json' }).$type<EvaluateSummaryV2 | object>().notNull(),
    config: text('config', { mode: 'json' }).$type<Partial<UnifiedConfig>>().notNull(),
    prompts: text('prompts', { mode: 'json' }).$type<CompletedPrompt[]>(),
  },
  (table) => ({
    createdAtIdx: index('evals_created_at_idx').on(table.createdAt),
    authorIdx: index('evals_author_idx').on(table.author),
  }),
);

export const evalResultsTable = sqliteTable(
  'eval_results',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id),
    promptIdx: integer('prompt_idx').notNull(),
    testIdx: integer('test_idx').notNull(),

    testCase: text('test_case', { mode: 'json' }).$type<AtomicTestCase>().notNull(),
    prompt: text('prompt', { mode: 'json' }).$type<Prompt>().notNull(),
    promptId: text('prompt_id').references(() => promptsTable.id),

    // Provider-related fields
    provider: text('provider', { mode: 'json' }).$type<ProviderOptions>().notNull(),

    latencyMs: integer('latency_ms'),
    cost: real('cost'),

    // Output-related fields
    response: text('response', { mode: 'json' }).$type<ProviderResponse>(),
    error: text('error'),
    failureReason: integer('failure_reason').default(ResultFailureReason.NONE).notNull(),

    // Result-related fields
    success: integer('success', { mode: 'boolean' }).notNull(),
    score: real('score').notNull(),
    gradingResult: text('grading_result', { mode: 'json' }).$type<GradingResult>(),
    namedScores: text('named_scores', { mode: 'json' }).$type<Record<string, number>>(),

    // Metadata fields
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, string>>(),
  },
  (table) => ({
    evalIdIdx: index('eval_result_eval_id_idx').on(table.evalId),
  }),
);

export const evalsToPromptsTable = sqliteTable(
  'evals_to_prompts',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
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

export const evalsToTagsTable = sqliteTable(
  'evals_to_tags',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id),
    tagId: text('tag_id')
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

export const datasetsTable = sqliteTable(
  'datasets',
  {
    id: text('id').primaryKey(),
    tests: text('tests', { mode: 'json' }).$type<UnifiedConfig['tests']>(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index('datasets_created_at_idx').on(table.createdAt),
  }),
);

export const evalsToDatasetsTable = sqliteTable(
  'evals_to_datasets',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id),
    // Drizzle doesn't support this migration for sqlite, so we remove foreign keys manually.
    //.references(() => evals.id, { onDelete: 'cascade' }),
    datasetId: text('dataset_id')
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

export const configsTable = sqliteTable(
  'configs',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    name: text('name').notNull(),
    type: text('type').notNull(), // e.g. 'redteam', 'eval', etc.
    config: text('config', { mode: 'json' }).notNull(),
  },
  (table) => ({
    createdAtIdx: index('configs_created_at_idx').on(table.createdAt),
    typeIdx: index('configs_type_idx').on(table.type),
  }),
);

// ------------ Outputs ------------
// We're just recording these on eval.results for now...

/*
export const llmOutputs = sqliteTable(
  'llm_outputs',
  {
    id: text('id')
      .notNull()
      .unique(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id),
    providerId: text('provider_id').notNull(),
    vars: text('vars', {mode: 'json'}),
    response: text('response', {mode: 'json'}),
    error: text('error'),
    latencyMs: integer('latency_ms'),
    gradingResult: text('grading_result', {mode: 'json'}),
    namedScores: text('named_scores', {mode: 'json'}),
    cost: real('cost'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id] }),
  }),
);

export const llmOutputsRelations = relations(llmOutputs, ({ one }) => ({
  eval: one(evals, {
    fields: [llmOutputs.evalId],
    references: [evals.id],
  }),
  prompt: one(prompts, {
    fields: [llmOutputs.promptId],
    references: [prompts.id],
  }),
}));
*/
