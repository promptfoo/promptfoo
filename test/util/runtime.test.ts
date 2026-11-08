import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
  },
}));

import logger from '../../src/logger';
import { printBorder } from '../../src/util/runtime';

describe('runtime utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('printBorder', () => {
    it.each([
      'should call logger.info with a border string',
      'should print a border of repeated equals signs',
    ])('%s', () => {
      printBorder();

      expect(logger.info).toHaveBeenCalledTimes(1);
      const call = vi.mocked(logger.info).mock.calls[0][0];
      expect(typeof call).toBe('string');
      expect(call).toMatch(/^=+$/);
      expect(call.length).toBeGreaterThan(0);
      expect(call.split('').every((char) => char === '=')).toBe(true);
    });
  });
});
