import { ValidateConfigTool } from '../../../../src/commands/mcp/tools/configuration/validate-config';
import { UnifiedConfigSchema, TestSuiteSchema } from '../../../../src/types';
import { loadDefaultConfig } from '../../../../src/util/config/default';
import { resolveConfigs } from '../../../../src/util/config/load';

// Mock the configuration loading functions
jest.mock('../../../../src/util/config/default', () => ({
  loadDefaultConfig: jest.fn(),
}));

jest.mock('../../../../src/util/config/load', () => ({
  resolveConfigs: jest.fn(),
}));

jest.mock('../../../../src/types', () => ({
  UnifiedConfigSchema: {
    safeParse: jest.fn(),
  },
  TestSuiteSchema: {
    safeParse: jest.fn(),
  },
}));

const mockLoadDefaultConfig = jest.mocked(loadDefaultConfig);
const mockResolveConfigs = jest.mocked(resolveConfigs);
const mockUnifiedConfigSchema = UnifiedConfigSchema as any;
const mockTestSuiteSchema = TestSuiteSchema as any;

describe('ValidateConfigTool', () => {
  let validateConfigTool: ValidateConfigTool;
  let mockServer: any;

  beforeEach(() => {
    validateConfigTool = new ValidateConfigTool();
    mockServer = {
      tool: jest.fn(),
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(validateConfigTool.name).toBe('validate_promptfoo_config');
      expect(validateConfigTool.description).toBe(
        'Validate promptfoo configuration files using the same logic as CLI validate',
      );
    });
  });

  describe('registration', () => {
    it('should register with MCP server', () => {
      validateConfigTool.register(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'validate_promptfoo_config',
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  describe('schema validation', () => {
    it('should accept valid arguments with configPaths', async () => {
      const mockConfig = {
        prompts: ['test'],
        providers: ['openai'],
        tests: [{ input: 'test', vars: {}, assert: [] }],
      } as any;
      const mockTestSuite = {
        prompts: [{ raw: 'test', label: 'test' }],
        providers: [{ id: 'openai' }],
        tests: [{ input: 'test', vars: {}, assert: [] }],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ configPaths: ['config.yaml'] });

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
    });

    it('should accept empty arguments (uses default config path)', async () => {
      const mockConfig = {
        prompts: ['test'],
        providers: ['openai'],
        tests: [{ input: 'test', vars: {}, assert: [] }],
      } as any;
      const mockTestSuite = {
        prompts: [{ raw: 'test', label: 'test' }],
        providers: [{ id: 'openai' }],
        tests: [{ input: 'test', vars: {}, assert: [] }],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      expect(result.isError).toBe(false);
      expect(mockResolveConfigs).toHaveBeenCalledWith(
        { config: ['promptfooconfig.yaml'] },
        expect.anything(),
      );
    });

    it('should reject empty config paths', async () => {
      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ configPaths: [''] });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toContain('Invalid arguments');
    });

    it('should accept strict mode flag', async () => {
      const mockConfig = {
        prompts: ['test'],
        providers: ['openai'],
        tests: [{ input: 'test', vars: {}, assert: [] }],
      } as any;
      const mockTestSuite = {
        prompts: [{ raw: 'test', label: 'test' }],
        providers: [{ id: 'openai' }],
        tests: [{ input: 'test', vars: {}, assert: [] }],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ strict: true });

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
    });
  });

  describe('successful validation', () => {
    it('should return valid configuration when validation passes', async () => {
      const mockConfig = {
        prompts: ['test prompt'],
        providers: ['openai:gpt-4'],
        tests: [{ input: 'test input', vars: {}, assert: [] }],
      } as any;
      const mockTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test prompt' }],
        providers: [{ id: 'openai:gpt-4' }],
        tests: [{ input: 'test input', vars: {}, assert: [] }],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ configPaths: ['config.yaml'] });

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);

      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toEqual({
        isValid: true,
        errors: [],
        warnings: ['Configuration ready: 1 prompts × 1 providers × 1 tests = 1 total evaluations'],
        config: mockConfig,
        testSuite: mockTestSuite,
      });
    });

    it('should include warnings for missing components', async () => {
      const mockConfig = {
        prompts: [],
        providers: [],
        tests: [],
      } as any;
      const mockTestSuite = {
        prompts: [],
        providers: [],
        tests: [],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data.warnings).toContain(
        'No prompts defined - add prompts to evaluate model responses',
      );
      expect(parsedContent.data.warnings).toContain(
        'No providers defined - add providers like "openai:gpt-4" to run evaluations',
      );
      expect(parsedContent.data.warnings).toContain(
        'No test cases defined - add test cases to validate model behavior',
      );
    });

    it('should handle empty arrays for configuration components', async () => {
      const mockConfig = {
        prompts: [],
        providers: [],
        tests: [],
      } as any;
      const mockTestSuite = {
        prompts: [],
        providers: [],
        tests: [],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.data.warnings).toContain(
        'No prompts defined - add prompts to evaluate model responses',
      );
      expect(parsedContent.data.warnings).toContain(
        'No providers defined - add providers like "openai:gpt-4" to run evaluations',
      );
      expect(parsedContent.data.warnings).toContain(
        'No test cases defined - add test cases to validate model behavior',
      );
    });
  });

  describe('validation errors', () => {
    it('should return errors when config schema validation fails', async () => {
      const mockConfig = { prompts: [], providers: [], tests: [] } as any;
      const mockTestSuite = {
        prompts: [],
        providers: [],
        tests: [],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({
        success: false,
        error: { message: 'Config validation failed' },
      });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data.isValid).toBe(false);
      expect(parsedContent.data.errors).toContain('Configuration validation error: Unknown error');
    });

    it('should return errors when test suite schema validation fails', async () => {
      const mockConfig = {
        prompts: ['test'],
        providers: ['openai'],
        tests: [],
      } as any;
      const mockTestSuite = {
        prompts: [],
        providers: [],
        tests: [],
      } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({
        success: false,
        error: { message: 'Test suite validation failed' },
      });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data.isValid).toBe(false);
      expect(parsedContent.data.errors).toContain('Test suite validation error: Unknown error');
    });

    it('should return errors for both config and test suite validation failures', async () => {
      const mockConfig = {} as any;
      const mockTestSuite = {} as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({
        success: false,
        error: { message: 'Config validation failed' },
      });
      mockTestSuiteSchema.safeParse.mockReturnValue({
        success: false,
        error: { message: 'Test suite validation failed' },
      });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data.isValid).toBe(false);
      expect(parsedContent.data.errors).toHaveLength(2);
      expect(parsedContent.data.errors[0]).toContain('Unknown error');
      expect(parsedContent.data.errors[1]).toContain('Unknown error');
    });
  });

  describe('error handling', () => {
    it('should handle loadDefaultConfig errors', async () => {
      mockLoadDefaultConfig.mockRejectedValue(new Error('Failed to load default config'));

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe(
        'Failed to load default config: Failed to load default config',
      );
    });

    it('should handle resolveConfigs errors', async () => {
      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockRejectedValue(new Error('Failed to resolve config'));

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ configPaths: ['missing-config.yaml'] });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe(
        'Failed to validate configuration: Failed to resolve config',
      );
    });

    it('should include config path in error when provided', async () => {
      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockRejectedValue(new Error('Config file not found'));

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ configPaths: ['invalid-config.yaml'] });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Failed to validate configuration: Config file not found');
      // Error responses don't include data in createToolResponse
      expect(parsedContent.data).toBeUndefined();
    });

    it('should handle unknown error types', async () => {
      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockRejectedValue('String error');

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Failed to validate configuration: Unknown error');
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple config paths', async () => {
      const mockConfig = { prompts: ['test'] } as any;
      const mockTestSuite = { tests: [] } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({
        configPaths: ['config1.yaml', 'config2.yaml'],
        strict: true,
      });

      expect(result.isError).toBe(false);
      expect(mockResolveConfigs).toHaveBeenCalledWith(
        { config: ['config1.yaml', 'config2.yaml'] },
        expect.anything(),
      );
    });

    it('should calculate evaluation count correctly', async () => {
      const mockConfig = {
        prompts: ['prompt1', 'prompt2'],
        providers: ['provider1', 'provider2', 'provider3'],
        tests: [{ input: 'test1' }, { input: 'test2' }, { input: 'test3' }, { input: 'test4' }],
      } as any;
      const mockTestSuite = { tests: mockConfig.tests } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.data.warnings).toContain(
        'Configuration ready: 2 prompts × 3 providers × 4 tests = 24 total evaluations',
      );
    });

    it('should handle single values as arrays', async () => {
      const mockConfig = {
        prompts: 'single prompt',
        providers: 'single provider',
        tests: { input: 'single test' },
      } as any;
      const mockTestSuite = { tests: [{ input: 'single test' }] } as any;

      mockLoadDefaultConfig.mockResolvedValue({
        defaultConfig: {},
        defaultConfigPath: undefined,
      } as any);
      mockResolveConfigs.mockResolvedValue({
        config: mockConfig,
        testSuite: mockTestSuite,
        basePath: '.',
      } as any);
      mockUnifiedConfigSchema.safeParse.mockReturnValue({ success: true });
      mockTestSuiteSchema.safeParse.mockReturnValue({ success: true });

      validateConfigTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.data.warnings).toContain(
        'Configuration ready: 1 prompts × 1 providers × 1 tests = 1 total evaluations',
      );
    });
  });
});
