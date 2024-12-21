import type { GradingResult } from '@promptfoo/types';

export interface StrategyStatsProps {
  strategyStats: Record<string, { pass: number; total: number }>;
  failuresByPlugin?: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  passesByPlugin?: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
}

export interface FunctionCallOutput {
  type: 'function';
  id: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

export interface TestExampleProps {
  prompt: string;
  output: string | FunctionCallOutput[] | object;
  type: 'pass' | 'failure';
  onClick?: () => void;
}
