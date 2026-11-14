import { describe, expect, it } from 'vitest';
import { getEvalApiPath } from './api';

describe('getEvalApiPath', () => {
  it('encodes reserved characters before appending an API suffix', () => {
    expect(getEvalApiPath('imported/eval?#1')).toBe('/eval/imported%2Feval%3F%231');
    expect(getEvalApiPath('imported/eval?#1', '/copy')).toBe('/eval/imported%2Feval%3F%231/copy');
    expect(getEvalApiPath('imported/eval?#1', '/table?format=csv')).toBe(
      '/eval/imported%2Feval%3F%231/table?format=csv',
    );
  });

  it('rejects a missing eval ID before constructing an API path', () => {
    expect(() => getEvalApiPath(null)).toThrow(
      'Eval ID must be set before constructing an API path',
    );
  });
});
