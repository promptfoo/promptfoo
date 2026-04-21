import { afterEach, describe, expect, it, vi } from 'vitest';
import { warnIfRedteamConfigHasNoTests } from '../../../src/commands/eval/redteamWarning';
import logger from '../../../src/logger';

import type { TestSuite, UnifiedConfig } from '../../../src/types/index';

vi.mock('../../../src/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    __esModule: true,
    default: mockLogger,
  };
});

describe('redteam warning in eval command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should warn when config has redteam section but no test cases', () => {
    const config = {
      redteam: {
        purpose: 'Test red team purpose',
      },
    } as Partial<UnifiedConfig>;
    const testSuite = {
      prompts: [],
      providers: [],
      tests: [],
    } as TestSuite;

    warnIfRedteamConfigHasNoTests(config, testSuite);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('redteam section but no test cases'),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('promptfoo redteam generate'));
  });

  it('should not warn when scenarios are present even if tests is empty', () => {
    const config = {
      redteam: {
        purpose: 'Test red team purpose',
      },
    } as Partial<UnifiedConfig>;
    const testSuite = {
      prompts: [],
      providers: [],
      tests: [],
      scenarios: [{ config: [], tests: [] }],
    } as TestSuite;

    warnIfRedteamConfigHasNoTests(config, testSuite);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
