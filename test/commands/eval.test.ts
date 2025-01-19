import { jest } from '@jest/globals';
import { showRedteamProviderLabelMissingWarning } from '../../src/commands/eval';
import logger from '../../src/logger';
import type { TestSuite } from '../../src/types';

jest.mock('../../src/logger');

describe('showRedteamProviderLabelMissingWarning', () => {
  let warnSpy: any;

  beforeEach(() => {
    jest.resetAllMocks();
    warnSpy = jest.spyOn(logger, 'warn');
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('should show warning when provider has no label', () => {
    const testSuite = {
      providers: [
        {
          id: () => 'provider1',
          callApi: () =>
            Promise.resolve({
              text: 'response',
              cached: false,
              success: true,
            }),
        },
      ],
      prompts: [],
      tests: [],
    } as TestSuite;

    showRedteamProviderLabelMissingWarning(testSuite);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Your target (provider) does not have a label specified'),
    );
  });

  it('should not show warning when all providers have labels', () => {
    const testSuite = {
      providers: [
        {
          id: () => 'provider1',
          label: 'Provider 1',
          callApi: () =>
            Promise.resolve({
              text: 'response',
              cached: false,
              success: true,
            }),
        },
      ],
      prompts: [],
      tests: [],
    } as TestSuite;

    showRedteamProviderLabelMissingWarning(testSuite);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should not show warning when providers array is empty', () => {
    const testSuite = {
      providers: [],
      prompts: [],
      tests: [],
    } as TestSuite;

    showRedteamProviderLabelMissingWarning(testSuite);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
