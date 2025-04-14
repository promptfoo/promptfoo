import fs from 'fs';
import { rm } from 'fs/promises';
import yaml from 'js-yaml';
import { reportProviderAPIKeyWarnings } from '../src/onboarding';
import { createDummyFiles } from '../src/onboarding';
import { TestSuiteConfigSchema } from '../src/types';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdtemp: jest.fn(),
  rm: jest.fn(),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('better-sqlite3');

jest.mock('@inquirer/select', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@inquirer/checkbox', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@inquirer/confirm', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../src/telemetry', () => ({
  recordAndSend: jest.fn(),
}));

jest.mock('../src/fetch', () => ({
  fetch: jest.fn(),
}));

jest.mock('../src/redteam/commands/init', () => ({
  redteamInit: jest.fn(),
}));

jest.mock('../src/envars', () => ({
  getEnvString: jest.fn(),
  getEnvBool: jest.fn(() => false),
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

  const mockSelect = jest.requireMock('@inquirer/select').default;
  const mockCheckbox = jest.requireMock('@inquirer/checkbox').default;
  const mockConfirm = jest.requireMock('@inquirer/confirm').default;
  const mockFs = jest.mocked(fs);

  beforeEach(() => {
    tempDir = '/fake/temp/dir';
    jest.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should generate a valid YAML configuration file that matches TestSuiteConfigSchema', async () => {
    await createDummyFiles(tempDir, false);

    const configCall = mockFs.writeFileSync.mock.calls.find((call) =>
      call[0].toString().endsWith('promptfooconfig.yaml'),
    );
    const readmeCall = mockFs.writeFileSync.mock.calls.find((call) =>
      call[0].toString().endsWith('README.md'),
    );

    expect(configCall).toBeDefined();
    expect(readmeCall).toBeDefined();

    const configContent = configCall?.[1] as string;
    expect(configContent).toBeDefined();

    const parsedConfig = yaml.load(configContent);
    const validationResult = TestSuiteConfigSchema.safeParse(parsedConfig);

    expect(validationResult.success).toBe(true);

    if (!validationResult.success) {
      throw new Error('Validation failed');
    }

    const config = validationResult.data;
    expect(config.prompts).toHaveLength(2);
    expect(config.providers).toHaveLength(2);
    expect(config.providers).toContain('openai:gpt-4o-mini');
    expect(config.providers).toContain('openai:gpt-4o');
  });

  it('should generate valid YAML configuration for RAG setup', async () => {
    mockSelect.mockResolvedValueOnce('rag').mockResolvedValueOnce('python');
    mockCheckbox.mockResolvedValueOnce(['openai:gpt-4o']);

    await createDummyFiles(tempDir, true);

    const configCall = mockFs.writeFileSync.mock.calls.find((call) =>
      call[0].toString().endsWith('promptfooconfig.yaml'),
    );
    const contextCall = mockFs.writeFileSync.mock.calls.find((call) =>
      call[0].toString().endsWith('context.py'),
    );

    expect(configCall).toBeDefined();
    expect(contextCall).toBeDefined();

    const configContent = configCall?.[1] as string;
    expect(configContent).toBeDefined();

    const parsedConfig = yaml.load(configContent);
    const validationResult = TestSuiteConfigSchema.safeParse(parsedConfig);

    expect(validationResult.success).toBe(true);

    if (!validationResult.success) {
      throw new Error('Validation failed');
    }

    const config = validationResult.data;
    expect(config.tests).toBeDefined();
    expect(Array.isArray(config.tests)).toBe(true);
    expect(config.tests?.length).toBeGreaterThan(0);

    const firstTest = config.tests?.[0];
    expect(firstTest).toBeTruthy();
    expect(typeof firstTest).toBe('object');
    expect(firstTest).toHaveProperty('vars');

    const vars = (firstTest as any).vars;
    expect(typeof vars).toBe('object');
    expect(vars).toHaveProperty('inquiry');
    expect(vars).toHaveProperty('context');

    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockCheckbox).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledTimes(0);
  });

  it('should prompt for confirmation when files exist', async () => {
    mockFs.existsSync.mockImplementation((path: fs.PathLike) =>
      path.toString().includes('promptfooconfig.yaml'),
    );

    mockConfirm.mockResolvedValueOnce(true);
    mockSelect.mockResolvedValueOnce('compare');
    mockCheckbox.mockResolvedValueOnce(['openai:gpt-4o']);

    await createDummyFiles(tempDir, true);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('already exist'),
      }),
    );
  });
});
