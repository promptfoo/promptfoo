import { vi } from 'vitest';

export const mockDbInstance = {
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

const mockRelations = vi.fn();

const mockSqliteTable = vi.fn().mockImplementation((tableName, schema) => {
  // You can customize this mock based on your testing needs
  return { tableName, schema };
});

export const prompts = mockSqliteTable('prompts', {
  /* schema definition */
});
export const promptsRelations = mockRelations;
export const datasets = mockSqliteTable('datasets', {
  /* schema definition */
});
export const datasetsRelations = mockRelations;
export const evals = mockSqliteTable('evals', {
  /* schema definition */
});
export const evalsRelations = mockRelations;
export const evalsToPrompts = mockSqliteTable('evals_to_prompts', {
  /* schema definition */
});
export const evalsToPromptsRelations = mockRelations;
export const evalsToDatasets = mockSqliteTable('evals_to_datasets', {
  /* schema definition */
});
export const evalsToDatasetsRelations = mockRelations;
export const llmOutputs = mockSqliteTable('llm_outputs', {
  /* schema definition */
});
export const llmOutputsRelations = mockRelations;
export const tracesTable = mockSqliteTable('traces', {
  /* schema definition */
});
export const spansTable = mockSqliteTable('spans', {
  /* schema definition */
});

export const getDb = vi.fn(() => mockDbInstance);
