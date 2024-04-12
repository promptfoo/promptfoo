const mockDbInstance = {
  // Mock any method you use from the dbInstance
  // For example:
  // query: jest.fn().mockResolvedValue({}),
};

const mockRelations = jest.fn();

const mockSqliteTable = jest.fn().mockImplementation((tableName, schema) => {
  // You can customize this mock based on your testing needs
  return { tableName, schema };
});

module.exports = {
  prompts: mockSqliteTable('prompts', {
    /* schema definition */
  }),
  promptsRelations: mockRelations,
  datasets: mockSqliteTable('datasets', {
    /* schema definition */
  }),
  datasetsRelations: mockRelations,
  evals: mockSqliteTable('evals', {
    /* schema definition */
  }),
  evalsRelations: mockRelations,
  evalsToPrompts: mockSqliteTable('evals_to_prompts', {
    /* schema definition */
  }),
  evalsToPromptsRelations: mockRelations,
  evalsToDatasets: mockSqliteTable('evals_to_datasets', {
    /* schema definition */
  }),
  evalsToDatasetsRelations: mockRelations,
  llmOutputs: mockSqliteTable('llm_outputs', {
    /* schema definition */
  }),
  llmOutputsRelations: mockRelations,
  getDb: jest.fn(() => mockDbInstance),
};
