export type EvalRow = {
  id: string;
  output: string;
  score?: number | null;
  passed?: boolean;
  prompt?: string;
  vars?: Record<string, any>;
  provider?: string;
  meta?: Record<string, any>;
};

export type EvalRun = {
  runId: string;
  createdAt?: string;
  configName?: string;
  rows: EvalRow[];
  summary?: { passRate?: number; avgScore?: number | null; total?: number };
};

export type RowDiff = {
  id: string;
  before?: EvalRow;
  after?: EvalRow;
  changed: boolean;
  outputDiffHtml?: string;
  scoreDelta?: number | null;
  passFlip?: 'none' | 'pass→fail' | 'fail→pass';
};

export type RunDiff = {
  from: EvalRun;
  to: EvalRun;
  rows: RowDiff[];
  summary: {
    totalCompared: number;
    changedCount: number;
    improvedCount: number;
    regressedCount: number;
    unchangedCount: number;
    avgScoreDelta?: number | null;
    passFlips: { toPass: number; toFail: number };
  };
};


// todo: delete duplicate