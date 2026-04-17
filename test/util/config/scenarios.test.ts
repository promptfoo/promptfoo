import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

import { globSync } from 'glob';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateAssertions } from '../../../src/assertions/validateAssertions';
import cliState from '../../../src/cliState';
import { readPrompts, readProviderPromptMap } from '../../../src/prompts/index';
import { loadApiProviders } from '../../../src/providers/index';
// Import after mocking
import { resolveConfigs } from '../../../src/util/config/load';
import { maybeLoadFromExternalFile } from '../../../src/util/file';
import { readFilters } from '../../../src/util/index';
import { readTests } from '../../../src/util/testCaseReader';

import type { ApiProvider } from '../../../src/types/providers';

vi.mock('fs');
vi.mock('fs/promises');
vi.mock('glob', () => ({
  globSync: vi.fn(),
  hasMagic: vi.fn((pattern: string | string[]) => {
    const p = Array.isArray(pattern) ? pattern.join('') : pattern;
    return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
  }),
}));

// Mock all the dependencies first
vi.mock('../../../src/util/file', async () => {
  const actual =
    await vi.importActual<typeof import('../../../src/util/file')>('../../../src/util/file');
  return {
    ...actual,
    maybeLoadFromExternalFile: vi.fn(),
  };
});
vi.mock('../../../src/prompts');
vi.mock('../../../src/providers');
vi.mock('../../../src/util/testCaseReader');
vi.mock('../../../src/util', async () => {
  const actual = await vi.importActual<typeof import('../../../src/util')>('../../../src/util');
  return {
    ...actual,
    readFilters: vi.fn(),
  };
});
vi.mock('../../../src/assertions/validateAssertions');

describe('Scenario loading with glob patterns', () => {
  const originalBasePath = cliState.basePath;

  beforeEach(() => {
    vi.clearAllMocks();
    cliState.basePath = '/test/path';

    // Setup default mocks
    vi.mocked(readPrompts).mockResolvedValue([{ raw: 'Test prompt', label: 'Test prompt' }]);
    vi.mocked(readProviderPromptMap).mockReturnValue({});
    vi.mocked(loadApiProviders).mockResolvedValue([
      { id: () => 'openai:gpt-3.5-turbo', callApi: vi.fn() } as unknown as ApiProvider,
    ]);
    vi.mocked(readTests).mockResolvedValue([]);
    vi.mocked(readFilters).mockResolvedValue({});
    vi.mocked(validateAssertions).mockImplementation(() => {});
  });

  afterEach(() => {
    cliState.basePath = originalBasePath;
  });

  it('should flatten scenarios when loaded with glob patterns', async () => {
    const scenario1 = {
      description: 'Scenario 1',
      config: [{ vars: { name: 'Alice' } }],
      tests: [{ vars: { question: 'Test 1' } }],
    };

    const scenario2 = {
      description: 'Scenario 2',
      config: [{ vars: { name: 'Bob' } }],
      tests: [{ vars: { question: 'Test 2' } }],
    };

    // Mock file system
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockImplementation((filePath) => {
      if (filePath === 'config.yaml') {
        return Promise.resolve(
          yaml.dump({
            prompts: ['Test prompt'],
            providers: ['openai:gpt-3.5-turbo'],
            scenarios: ['file://scenarios/*.yaml'],
          }),
        );
      }
      return Promise.resolve('');
    });

    // Mock glob to return config file
    vi.mocked(globSync).mockReturnValue(['config.yaml']);

    // Mock maybeLoadFromExternalFile to return nested array (simulating glob expansion)
    vi.mocked(maybeLoadFromExternalFile).mockImplementation((input) => {
      if (Array.isArray(input) && input[0] === 'file://scenarios/*.yaml') {
        // Return nested array as would happen with glob pattern
        return [[scenario1, scenario2]];
      }
      return input;
    });

    const cmdObj = { config: ['config.yaml'] };
    const defaultConfig = {};

    const { testSuite } = await resolveConfigs(cmdObj, defaultConfig);

    // Check if maybeLoadFromExternalFile was called with the expected argument
    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith(['file://scenarios/*.yaml']);

    // Verify scenarios are flattened correctly
    expect(testSuite.scenarios).toHaveLength(2);
    expect(testSuite.scenarios![0]).toEqual(scenario1);
    expect(testSuite.scenarios![1]).toEqual(scenario2);
  });

  it('should handle multiple scenario files with glob patterns', async () => {
    const scenarios = [
      {
        description: 'Scenario A',
        config: [{ vars: { test: 'A' } }],
        tests: [{ vars: { input: '1' } }],
      },
      {
        description: 'Scenario B',
        config: [{ vars: { test: 'B' } }],
        tests: [{ vars: { input: '2' } }],
      },
      {
        description: 'Scenario C',
        config: [{ vars: { test: 'C' } }],
        tests: [{ vars: { input: '3' } }],
      },
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockImplementation((filePath) => {
      if (filePath === 'config.yaml') {
        return Promise.resolve(
          yaml.dump({
            prompts: ['Test prompt'],
            providers: ['openai:gpt-3.5-turbo'],
            scenarios: ['file://group1/*.yaml', 'file://group2/*.yaml'],
          }),
        );
      }
      return Promise.resolve('');
    });

    vi.mocked(globSync).mockReturnValue(['config.yaml']);

    vi.mocked(maybeLoadFromExternalFile).mockImplementation((input) => {
      if (Array.isArray(input)) {
        // Simulate two glob patterns each returning different scenarios
        return [
          [scenarios[0], scenarios[1]], // group1/*.yaml
          [scenarios[2]], // group2/*.yaml
        ];
      }
      return input;
    });

    const cmdObj = { config: ['config.yaml'] };
    const defaultConfig = {};

    const { testSuite } = await resolveConfigs(cmdObj, defaultConfig);

    // Verify all scenarios are flattened into a single array
    expect(testSuite.scenarios).toHaveLength(3);
    expect(testSuite.scenarios).toEqual(scenarios);
  });

  it('should handle mixed scenario loading (direct and glob)', async () => {
    const directScenario = {
      description: 'Direct scenario',
      config: [{ vars: { type: 'direct' } }],
      tests: [{ vars: { test: 'direct' } }],
    };

    const globScenarios = [
      {
        description: 'Glob scenario 1',
        config: [{ vars: { type: 'glob' } }],
        tests: [{ vars: { test: 'glob1' } }],
      },
      {
        description: 'Glob scenario 2',
        config: [{ vars: { type: 'glob' } }],
        tests: [{ vars: { test: 'glob2' } }],
      },
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockImplementation((filePath) => {
      if (filePath === 'config.yaml') {
        return Promise.resolve(
          yaml.dump({
            prompts: ['Test prompt'],
            providers: ['openai:gpt-3.5-turbo'],
            scenarios: [directScenario, 'file://scenarios/*.yaml'],
          }),
        );
      }
      return Promise.resolve('');
    });

    vi.mocked(globSync).mockReturnValue(['config.yaml']);

    vi.mocked(maybeLoadFromExternalFile).mockImplementation((input) => {
      if (Array.isArray(input)) {
        // First element is direct scenario, second is glob pattern
        return [directScenario, globScenarios];
      }
      return input;
    });

    const cmdObj = { config: ['config.yaml'] };
    const defaultConfig = {};

    const { testSuite } = await resolveConfigs(cmdObj, defaultConfig);

    // Verify mixed scenarios are flattened correctly
    expect(testSuite.scenarios).toHaveLength(3);
    expect(testSuite.scenarios![0]).toEqual(directScenario);
    expect(testSuite.scenarios![1]).toEqual(globScenarios[0]);
    expect(testSuite.scenarios![2]).toEqual(globScenarios[1]);
  });
});
