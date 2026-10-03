import { describe, expect, it } from 'vitest';
import { EVAL_ROUTES, REDTEAM_ROUTES } from './routes';

describe('eval route helpers', () => {
  it('encodes eval IDs in route path and query values', () => {
    const evalId = 'imported/eval?#1&2';

    expect(EVAL_ROUTES.DETAIL(evalId)).toBe('/eval/imported%2Feval%3F%231%262');
    expect(REDTEAM_ROUTES.REPORT_DETAIL(evalId)).toBe('/reports?evalId=imported%2Feval%3F%231%262');
  });

  it('encodes both eval and result IDs in result rating paths', () => {
    expect(EVAL_ROUTES.RESULT_RATING('imported/eval?#1', 'result/1?#')).toBe(
      '/eval/imported%2Feval%3F%231/results/result%2F1%3F%23/rating',
    );
  });
});
