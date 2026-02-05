import { rm } from 'fs/promises';

import yaml from 'js-yaml';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDummyFiles, reportProviderAPIKeyWarnings } from '../src/onboarding';
import { TestSuiteConfigSchema } from '../src/types/index';

// Create hoisted mocks for inquirer modules
const mockSelect = vi.hoisted(() => vi.fn());
const mockCheckbox = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn());
const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

vi.mock('better-sqlite3');

vi.mock('@inquirer/select', () => ({
  __esModule: true,
  default: mockSelect,
}));

vi.mock('@inquirer/checkbox', () => ({
  __esModule: true,
  default: mockCheckbox,
}));

vi.mock('@inquirer/confirm', () => ({
  __esModule: true,
  default: mockConfirm,
}));

vi.mock('../src/database', () => ({
  getDb: vi.fn(),
}));

vi.mock('../src/telemetry', () => ({
  default: { record: vi.fn() },
  record: vi.fn(),
}));

vi.mock('../src/util/fetch/index.ts', () => ({
  fetch: vi.fn(),
}));

vi.mock('../src/redteam/commands/init', () => ({
  redteamInit: vi.fn(),
}));

vi.mock('../src/envars', () => ({
  getEnvString: vi.fn(),
  getEnvBool: vi.fn(() => false),
  getEnvInt: vi.fn((_key: string, defaultValue: number) => defaultValue),
}));

describe('reportProviderAPIKeyWarnings', () => {
  const openaiID = 'openai:gpt-4o';
  const anthropicID = 'anthropic:messages:claude-3-5-sonnet-20241022';
  let oldEnv: any = {};
  beforeAll(() => {
    oldEnv = { ...process.env };
  });
  beforeEach(() => {
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
  });
  afterAll(() => {
    process.env = { ...oldEnv };
  });
  it('should produce a warning for openai if env key is not set', () => {
    expect(reportProviderAPIKeyWarnings([openaiID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should produce a warning for anthropic if env key is not set', () => {
    expect(reportProviderAPIKeyWarnings([anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should produce multiple warnings for applicable providers if env keys are not set', () => {
    expect(reportProviderAPIKeyWarnings([openaiID, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should be able to accept an object input so long as it has a valid id field', () => {
    expect(reportProviderAPIKeyWarnings([{ id: openaiID }, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should produce only warnings for applicable providers if the env keys are not set', () => {
    process.env.OPENAI_API_KEY = '<my-api-key>';
    expect(reportProviderAPIKeyWarnings([openaiID, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
});

describe('createDummyFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/fake/temp/dir';
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should generate a valid YAML configuration file that matches TestSuiteConfigSchema', async () => {
    await createDummyFiles(tempDir, false);

    const configCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('promptfooconfig.yaml'),
    );
    const readmeCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('README.md'),
    );

    expect(configCall).toBeDefined();
    expect(readmeCall).toBeDefined();

    const configContent = configCall?.[1] as string;
    expect(configContent).toBeDefined();

    const parsedConfig = yaml.load(configContent);
    const validationResult = TestSuiteConfigSchema.safeParse(parsedConfig);

    expect(validationResult.success).toBe(true);

    // Assert that validation was successful and config is defined
    expect(validationResult.data).toBeDefined();

    const config = validationResult.data!;
    expect(config.prompts).toHaveLength(2);
    expect(config.providers).toHaveLength(2);
    expect(config.providers).toContain('openai:gpt-5-mini');
    expect(config.providers).toContain('openai:gpt-5');
  });

  it('should generate valid YAML configuration for RAG setup', async () => {
    mockSelect
      .mockResolvedValueOnce('rag')
      .mockResolvedValueOnce('python')
      .mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true);

    const configCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('promptfooconfig.yaml'),
    );
    const contextCall = mockFs.writeFileSync.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('context.py'),
    );

    expect(configCall).toBeDefined();
    expect(contextCall).toBeDefined();

    const configContent = configCall?.[1] as string;
    expect(configContent).toBeDefined();

    const parsedConfig = yaml.load(configContent);
    const validationResult = TestSuiteConfigSchema.safeParse(parsedConfig);

    expect(validationResult.success).toBe(true);

    // Assert that validation was successful and config is defined
    expect(validationResult.data).toBeDefined();

    const config = validationResult.data!;
    expect(config.tests).toBeDefined();
    expect(Array.isArray(config.tests)).toBe(true);

    const tests = config.tests as any[];
    expect(tests.length).toBeGreaterThan(0);

    const firstTest = tests[0];
    expect(firstTest).toBeTruthy();
    expect(typeof firstTest).toBe('object');
    expect(firstTest).toHaveProperty('vars');

    const { vars } = firstTest;
    expect(typeof vars).toBe('object');
    expect(vars).toHaveProperty('inquiry');
    expect(vars).toHaveProperty('context');

    expect(mockSelect).toHaveBeenCalledTimes(3);
    expect(mockCheckbox).toHaveBeenCalledTimes(0);
    expect(mockConfirm).toHaveBeenCalledTimes(0);
  });

  it('should prompt for confirmation when files exist', async () => {
    mockFs.existsSync.mockImplementation((path: string) =>
      path.toString().includes('promptfooconfig.yaml'),
    );

    mockConfirm.mockResolvedValueOnce(true);
    mockSelect.mockResolvedValueOnce('compare').mockResolvedValueOnce('openai:gpt-4o');

    await createDummyFiles(tempDir, true);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('already exist'),
      }),
    );
  });
});
