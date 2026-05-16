import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/testCase/synthesis', () => ({
  synthesizeFromTestSuite: vi.fn().mockResolvedValue([{ name: 'Ada' }]),
}));

vi.mock('../../../../src/types/index', () => ({
  TestSuiteSchema: { safeParse: vi.fn(() => ({ success: true })) },
  UnifiedConfigSchema: { safeParse: vi.fn(() => ({ success: true })) },
}));

vi.mock('../../../../src/util/config/default', () => ({
  loadDefaultConfig: vi.fn().mockResolvedValue({
    defaultConfig: {},
    defaultConfigPath: 'promptfooconfig.yaml',
  }),
}));

vi.mock('../../../../src/util/config/load', () => ({
  ConfigResolutionError: class ConfigResolutionError extends Error {
    cliMessage: string;

    constructor(cliMessage: string) {
      super(cliMessage);
      this.cliMessage = cliMessage;
    }
  },
  resolveConfigs: vi.fn().mockResolvedValue({
    config: {
      prompts: ['Hello {{name}}'],
      providers: ['echo'],
      tests: [{ vars: { name: 'Ada' }, assert: [{ type: 'contains', value: 'Ada' }] }],
    },
    testSuite: {
      prompts: [{ label: 'hello', raw: 'Hello {{name}}' }],
      providers: [{ id: 'echo' }],
      tests: [{ vars: { name: 'Ada' }, assert: [{ type: 'contains', value: 'Ada' }] }],
    },
  }),
}));

vi.mock('../../../../src/redteam/commands/generate', () => ({
  doGenerateRedteam: vi.fn().mockResolvedValue({
    defaultTest: { metadata: { entities: [], purpose: 'test' } },
    tests: [],
  }),
}));

vi.mock('../../../../src/redteam/shared', () => ({
  doRedteamRun: vi.fn().mockResolvedValue({
    id: 'redteam-eval',
    toEvaluateSummary: vi.fn().mockResolvedValue({
      results: [],
      stats: { errors: 0, failures: 0, successes: 0 },
    }),
  }),
}));

vi.mock('../../../../src/providers/index', () => ({
  loadApiProvider: vi.fn().mockResolvedValue({
    callApi: vi.fn().mockResolvedValue({ output: '9' }),
    id: 'mock-provider',
  }),
  loadApiProviders: vi.fn().mockResolvedValue([
    {
      callApi: vi.fn().mockResolvedValue({ output: '9' }),
      id: 'mock-provider',
    },
  ]),
}));

vi.mock('../../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

function captureToolHandler(registerTool: (server: any) => void) {
  let handler: ((args: any) => Promise<any>) | undefined;

  registerTool({
    tool: vi.fn((_name, _schema, toolHandler) => {
      handler = toolHandler;
    }),
  });

  if (!handler) {
    throw new Error('Tool handler was not registered');
  }

  return handler;
}

function parseToolResponse(result: any) {
  return JSON.parse(result.content[0].text);
}

function outsideWorkspacePath(filename: string) {
  return path.join(path.dirname(process.cwd()), filename);
}

describe('MCP tool security guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject generate_test_cases output paths outside the workspace', async () => {
    const { synthesizeFromTestSuite } = await import('../../../../src/testCase/synthesis');
    const { registerGenerateTestCasesTool } = await import(
      '../../../../src/commands/mcp/tools/generateTestCases'
    );
    const handler = captureToolHandler(registerGenerateTestCasesTool);

    const result = await handler({
      outputPath: outsideWorkspacePath('generated-cases.yaml'),
      prompt: 'Translate {{text}}',
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Path must be within base directory');
    expect(synthesizeFromTestSuite).not.toHaveBeenCalled();
  });

  it('should reject generate_test_cases provider paths outside the workspace', async () => {
    const { synthesizeFromTestSuite } = await import('../../../../src/testCase/synthesis');
    const { registerGenerateTestCasesTool } = await import(
      '../../../../src/commands/mcp/tools/generateTestCases'
    );
    const handler = captureToolHandler(registerGenerateTestCasesTool);

    const result = await handler({
      prompt: 'Translate {{text}}',
      provider: `file://${outsideWorkspacePath('custom-provider.js')}`,
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Path must be within base directory');
    expect(synthesizeFromTestSuite).not.toHaveBeenCalled();
  });

  it('should reject validate_promptfoo_config paths outside the workspace', async () => {
    const { resolveConfigs } = await import('../../../../src/util/config/load');
    const { registerValidatePromptfooConfigTool } = await import(
      '../../../../src/commands/mcp/tools/validatePromptfooConfig'
    );
    const handler = captureToolHandler(registerValidatePromptfooConfigTool);

    const result = await handler({
      configPaths: [outsideWorkspacePath('promptfooconfig.yaml')],
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Path must be within base directory');
    expect(resolveConfigs).not.toHaveBeenCalled();
  });

  it('should summarize validate_promptfoo_config results without returning raw configs', async () => {
    const { registerValidatePromptfooConfigTool } = await import(
      '../../../../src/commands/mcp/tools/validatePromptfooConfig'
    );
    const handler = captureToolHandler(registerValidatePromptfooConfigTool);

    const result = await handler({ configPaths: ['promptfooconfig.yaml'] });
    const response = parseToolResponse(result);

    expect(result.isError).toBe(false);
    expect(response.data.config).toBeUndefined();
    expect(response.data.testSuite).toBeUndefined();
    expect(response.data.summary).toMatchObject({
      configFiles: ['promptfooconfig.yaml'],
      promptCount: 1,
      providerCount: 1,
      testCount: 1,
    });
  });

  it('should reject redteam_generate paths outside the workspace', async () => {
    const { doGenerateRedteam } = await import('../../../../src/redteam/commands/generate');
    const { registerRedteamGenerateTool } = await import(
      '../../../../src/commands/mcp/tools/redteamGenerate'
    );
    const handler = captureToolHandler(registerRedteamGenerateTool);

    const result = await handler({
      configPath: outsideWorkspacePath('redteam-config.yaml'),
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Path must be within base directory');
    expect(doGenerateRedteam).not.toHaveBeenCalled();
  });

  it('should reject redteam_run output paths outside the workspace', async () => {
    const { doRedteamRun } = await import('../../../../src/redteam/shared');
    const { registerRedteamRunTool } = await import(
      '../../../../src/commands/mcp/tools/redteamRun'
    );
    const handler = captureToolHandler(registerRedteamRunTool);

    const result = await handler({
      output: outsideWorkspacePath('redteam.yaml'),
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Path must be within base directory');
    expect(doRedteamRun).not.toHaveBeenCalled();
  });

  it('should reject test_provider paths outside the workspace', async () => {
    const { loadApiProvider, loadApiProviders } = await import('../../../../src/providers/index');
    const { registerTestProviderTool } = await import(
      '../../../../src/commands/mcp/tools/testProvider'
    );
    const handler = captureToolHandler(registerTestProviderTool);

    const result = await handler({
      provider: `file://${outsideWorkspacePath('custom-provider.js')}`,
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Failed to test provider');
    expect(loadApiProvider).not.toHaveBeenCalled();
    expect(loadApiProviders).not.toHaveBeenCalled();
  });

  it('should reject compare_providers paths outside the workspace', async () => {
    const { loadApiProviders } = await import('../../../../src/providers/index');
    const { registerCompareProvidersTool } = await import(
      '../../../../src/commands/mcp/tools/compareProviders'
    );
    const handler = captureToolHandler(registerCompareProvidersTool);

    const result = await handler({
      providers: ['openai:gpt-4o', `file://${outsideWorkspacePath('custom-provider.js')}`],
      testPrompt: 'hello',
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Path must be within base directory');
    expect(loadApiProviders).not.toHaveBeenCalled();
  });
});
