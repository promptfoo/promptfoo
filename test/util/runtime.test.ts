import { expect, it, vi } from 'vitest';

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
  },
}));

import { TERMINAL_MAX_WIDTH } from '../../src/constants';
import logger from '../../src/logger';
import { printBorder } from '../../src/util/runtime';

it('logs one border matching the configured terminal width', () => {
  printBorder();

  expect(logger.info).toHaveBeenCalledExactlyOnceWith('='.repeat(TERMINAL_MAX_WIDTH));
});
