import { describe, expect, it } from 'vitest';
import { wilsonInterval } from '../../../src/util/eval/passRateStats';

// Reference values computed with statsmodels' proportion_confint(method="wilson")
// at alpha=0.05.
describe('wilsonInterval', () => {
  it('matches the reference implementation', () => {
    const cases: Array<[number, number, number, number]> = [
      [85, 100, 0.7671644040916763, 0.9069401471634337],
      [1, 3, 0.06149194472039626, 0.7923403991979523],
      [17, 20, 0.639581135259243, 0.9476312541037833],
    ];
    for (const [passes, total, low, high] of cases) {
      const interval = wilsonInterval(passes, total);
      expect(interval.low).toBeCloseTo(low, 9);
      expect(interval.high).toBeCloseTo(high, 9);
    }
  });

  it('behaves sensibly at the boundaries where the naive interval collapses', () => {
    const allFail = wilsonInterval(0, 10);
    expect(allFail.low).toBe(0);
    expect(allFail.high).toBeCloseTo(0.27753279986288926, 9);

    const allPass = wilsonInterval(10, 10);
    expect(allPass.low).toBeCloseTo(0.7224672001371106, 9);
    expect(allPass.high).toBe(1);
  });

  it('narrows as the sample grows at the same pass rate', () => {
    const small = wilsonInterval(17, 20);
    const large = wilsonInterval(850, 1000);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('returns the uninformative interval for invalid inputs', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    expect(wilsonInterval(-1, 10)).toEqual({ low: 0, high: 1 });
    expect(wilsonInterval(11, 10)).toEqual({ low: 0, high: 1 });
  });
});
