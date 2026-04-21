import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { CodeScanSeverity, validateSeverity } from '../../src/types/codeScan';

describe('validateSeverity', () => {
  it.each([
    ['critical', CodeScanSeverity.CRITICAL],
    ['HIGH', CodeScanSeverity.HIGH],
    ['  medium  ', CodeScanSeverity.MEDIUM],
    ['\tLoW\n', CodeScanSeverity.LOW],
    ['NoNe', CodeScanSeverity.NONE],
  ])('normalizes %j to %s', (input, expected) => {
    expect(validateSeverity(input)).toBe(expected);
  });

  it.each([
    'invalid',
    '',
    '123',
    'high!',
    'critic',
    'highh',
  ])('rejects invalid severity %j', (input) => {
    expect(() => validateSeverity(input)).toThrow(ZodError);
  });
});
