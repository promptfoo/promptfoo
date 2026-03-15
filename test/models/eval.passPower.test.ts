import { describe, expect, it } from 'vitest';
import Eval from '../../src/models/eval';

describe('Eval pass^N stats', () => {
  it('includes pass^N in stats when configured', () => {
    const evalRecord = new Eval({}, { runtimeOptions: { passPower: 2, repeat: 2 } });
    evalRecord.results = [
      { testIdx: 0, promptIdx: 0, testCase: { vars: { input: 'a' } }, success: true },
      { testIdx: 0, promptIdx: 0, testCase: { vars: { input: 'a' } }, success: false },
      { testIdx: 1, promptIdx: 0, testCase: { vars: { input: 'b' } }, success: true },
      { testIdx: 1, promptIdx: 0, testCase: { vars: { input: 'b' } }, success: true },
    ] as any;

    const stats = evalRecord.getStats();

    expect(stats.passPowerOfN?.n).toBe(2);
    expect(stats.passPowerOfN?.overallScore).toBeCloseTo(62.5);
  });
});
