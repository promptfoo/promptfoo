import { relations, sql } from 'drizzle-orm';
import {
  text,
  integer,
  sqliteTable,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { EvaluateSummary, UnifiedConfig } from '../types';

// ------------ Prompts ------------

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    content: text('content').notNull(),
    type: text('type').notNull(),
    version: integer('version').notNull(),
    author: text('author'),
  },
  (table) => ({
    createdAtIdx: index('prompts_created_at_idx').on(table.createdAt),
    typeIdx: index('prompts_type_idx').on(table.type),
    versionIdx: index('prompts_version_idx').on(table.version),
  }),
);

export const promptLabels = sqliteTable(
  'prompt_labels',
  {
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id),
    label: text('label').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.promptId, t.label] }),
    promptIdIdx: index('prompt_labels_prompt_id_idx').on(t.promptId),
    labelIdx: index('prompt_labels_label_idx').on(t.label),
  }),
);

export const promptLabelsRelations = relations(promptLabels, ({ one }) => ({
  prompt: one(prompts, {
    fields: [promptLabels.promptId],
    references: [prompts.id],
  }),
}));

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
      .default(sql`CURRENT_TIMESTAMP`),
    author: text('author'),
    description: text('description'),
    results: text('results', { mode: 'json' }).$type<EvaluateSummary>().notNull(),
    config: text('config', { mode: 'json' }).$type<Partial<UnifiedConfig>>().notNull(),
  },
  (table) => ({
    createdAtIdx: index('evals_created_at_idx').on(table.createdAt),
    authorIdx: index('evals_author_idx').on(table.author),
  }),
);

export const evalsToPrompts = sqliteTable(
  'evals_to_prompts',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id),
    // Drizzle doesn't support this migration for sqlite, so we remove foreign keys manually.
    //.references(() => evals.id, { onDelete: 'cascade' }),
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

// ------------ Datasets ------------

export const datasets = sqliteTable(
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
