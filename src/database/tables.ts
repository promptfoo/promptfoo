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
import type {
  Prompt,
  ProviderResponse,
  GradingResult,
  UnifiedConfig,
  ProviderOptions,
  AtomicTestCase,
  CompletedPrompt,
  EvaluateSummaryV2,
} from '../types';

// ------------ Providers ------------

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  config: text('options', { mode: 'json' }).$type<Record<string, any>>().notNull(),
});

// ------------ Prompts ------------

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`cast(unixepoch() as int)`),
    prompt: text('prompt').notNull(),
  },
  (table) => ({
    createdAtIdx: index('prompts_created_at_idx').on(table.createdAt),
  }),
);

// ------------ Tags ------------

export const tags = sqliteTable(
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

export const evals = sqliteTable(
  'evals',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`cast(unixepoch() as int)`),
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
      .default(sql`cast(unixepoch() as int)`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`cast(unixepoch() as int)`),
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id),
    promptIdx: integer('prompt_idx').notNull(),
    testIdx: integer('test_idx').notNull(),

    testCase: text('test_case', { mode: 'json' }).$type<AtomicTestCase>().notNull(),
    prompt: text('prompt', { mode: 'json' }).$type<Prompt>().notNull(),
    promptId: text('prompt_id').references(() => prompts.id),

    // Provider-related fields
    provider: text('provider', { mode: 'json' }).$type<ProviderOptions>().notNull(),
    providerId: text('provider_id').references(() => providers.id),

    latencyMs: integer('latency_ms'),
    cost: real('cost'),

    // Output-related fields
    response: text('response', { mode: 'json' }).$type<ProviderResponse>(),
    error: text('error'),

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

export const evalsToPrompts = sqliteTable(
  'evals_to_prompts',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.promptId] }),
    evalIdIdx: index('evals_to_prompts_eval_id_idx').on(t.evalId),
    promptIdIdx: index('evals_to_prompts_prompt_id_idx').on(t.promptId),
  }),
);

export const promptsRelations = relations(prompts, ({ many }) => ({
  evalsToPrompts: many(evalsToPrompts),
}));

export const evalsToTags = sqliteTable(
  'evals_to_tags',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.tagId] }),
    evalIdIdx: index('evals_to_tags_eval_id_idx').on(t.evalId),
    tagIdIdx: index('evals_to_tags_tag_id_idx').on(t.tagId),
  }),
);

export const tagsRelations = relations(tags, ({ many }) => ({
  evalsToTags: many(evalsToTags),
}));

export const evalsToTagsRelations = relations(evalsToTags, ({ one }) => ({
  eval: one(evals, {
    fields: [evalsToTags.evalId],
    references: [evals.id],
  }),
  tag: one(tags, {
    fields: [evalsToTags.tagId],
    references: [tags.id],
  }),
}));

export const evalsToProviders = sqliteTable(
  'evals_to_providers',
  {
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.providerId, t.evalId] }),
  }),
);

export const evalsToProvidersRelations = relations(evalsToProviders, ({ one }) => ({
  provider: one(providers, {
    fields: [evalsToProviders.providerId],
    references: [providers.id],
  }),
  eval: one(evals, {
    fields: [evalsToProviders.evalId],
    references: [evals.id],
  }),
}));

// ------------ Datasets ------------

export const datasets = sqliteTable(
  'datasets',
  {
    id: text('id').primaryKey(),
    tests: text('tests', { mode: 'json' }).$type<UnifiedConfig['tests']>(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`cast(unixepoch() as int)`),
  },
  (table) => ({
    createdAtIdx: index('datasets_created_at_idx').on(table.createdAt),
  }),
);

export const evalsToDatasets = sqliteTable(
  'evals_to_datasets',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id),
    // Drizzle doesn't support this migration for sqlite, so we remove foreign keys manually.
    //.references(() => evals.id, { onDelete: 'cascade' }),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.datasetId] }),
    evalIdIdx: index('evals_to_datasets_eval_id_idx').on(t.evalId),
    datasetIdIdx: index('evals_to_datasets_dataset_id_idx').on(t.datasetId),
  }),
);

export const datasetsRelations = relations(datasets, ({ many }) => ({
  evalsToDatasets: many(evalsToDatasets),
}));

// ------------ Evals ------------

export const evalsRelations = relations(evals, ({ many }) => ({
  evalsToPrompts: many(evalsToPrompts),
  evalsToDatasets: many(evalsToDatasets),
  evalsToTags: many(evalsToTags),
}));

export const evalsToPromptsRelations = relations(evalsToPrompts, ({ one }) => ({
  eval: one(evals, {
    fields: [evalsToPrompts.evalId],
    references: [evals.id],
  }),
  prompt: one(prompts, {
    fields: [evalsToPrompts.promptId],
    references: [prompts.id],
  }),
}));

export const evalsToDatasetsRelations = relations(evalsToDatasets, ({ one }) => ({
  eval: one(evals, {
    fields: [evalsToDatasets.evalId],
    references: [evals.id],
  }),
  dataset: one(datasets, {
    fields: [evalsToDatasets.datasetId],
    references: [datasets.id],
  }),
}));

// ------------ Outputs ------------
// We're just recording these on eval.results for now...

/*
export const llmOutputs = sqliteTable(
  'llm_outputs',
  {
    id: text('id')
      .notNull()
      .unique(),
    createdAt: integer('created_at').notNull().default(sql`cast(unixepoch() as int)`),
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
