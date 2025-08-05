export const mockDbInstance = {
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockResolvedValue(undefined),
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
};

const mockRelations = jest.fn();

const mockSqliteTable = jest.fn().mockImplementation((tableName, schema) => {
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

export const getDb = jest.fn(() => mockDbInstance);
