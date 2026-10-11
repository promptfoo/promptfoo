import { type Mock, vi } from 'vitest';

export const mockDbInstance: Record<
  'insert' | 'values' | 'select' | 'from' | 'where' | 'limit' | 'delete' | 'update' | 'set',
  Mock
> = {
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
export const promptsRelations: Mock = mockRelations;
export const datasets = mockSqliteTable('datasets', {
  /* schema definition */
});
export const datasetsRelations: Mock = mockRelations;
export const evals = mockSqliteTable('evals', {
  /* schema definition */
});
export const evalsRelations: Mock = mockRelations;
export const evalsToPrompts = mockSqliteTable('evals_to_prompts', {
  /* schema definition */
});
export const evalsToPromptsRelations: Mock = mockRelations;
export const evalsToDatasets = mockSqliteTable('evals_to_datasets', {
  /* schema definition */
});
export const evalsToDatasetsRelations: Mock = mockRelations;
export const tracesTable = mockSqliteTable('traces', {
  /* schema definition */
});
export const spansTable = mockSqliteTable('spans', {
  /* schema definition */
});

export const getDb: Mock<() => typeof mockDbInstance> = vi.fn(() => mockDbInstance);
