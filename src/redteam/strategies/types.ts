import type { TestCase, TestCaseWithPlugin } from '../../types/index';
import type { StrategyConfig } from '../types';

export interface Strategy {
  id: string;
  action: (
    testCases: TestCaseWithPlugin[],
    injectVar: string,
    config: StrategyConfig,
    strategyId?: string,
  ) => Promise<TestCase[]>;
}
