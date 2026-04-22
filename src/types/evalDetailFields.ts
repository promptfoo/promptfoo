export const EVAL_TABLE_CELL_DETAIL_FIELDS = [
  'prompt',
  'response',
  'testCase',
  'metadata',
  'media',
] as const;
export type EvalTableCellDetailField = (typeof EVAL_TABLE_CELL_DETAIL_FIELDS)[number];

export const EVAL_CONFIG_DETAIL_FIELDS = ['tests', 'defaultTest', 'scenarios'] as const;
export type EvalConfigDetailField = (typeof EVAL_CONFIG_DETAIL_FIELDS)[number];
