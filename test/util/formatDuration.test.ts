import { expect, it } from 'vitest';
import { formatDuration } from '../../src/util/formatDuration';

it.each([
  [0, '0s'],
  [45.9, '45s'],
  [59, '59s'],
  [60, '1m 0s'],
  [65, '1m 5s'],
  [119, '1m 59s'],
  [600, '10m 0s'],
  [3600, '1h 0m 0s'],
  [3661, '1h 1m 1s'],
  [7382, '2h 3m 2s'],
  [86400, '24h 0m 0s'],
  [90061, '25h 1m 1s'],
] as const)('formats %s seconds as %s', (seconds, expected) => {
  expect(formatDuration(seconds)).toBe(expected);
});

it.each([NaN, Infinity, -Infinity, -10, -0.1])('displays %s as zero', (seconds) => {
  expect(formatDuration(seconds)).toBe('0s');
});
