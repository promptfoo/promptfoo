import fs from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const securityGuardMocks = vi.hoisted(() => ({
  doEval: vi.fn(),
  doGenerateRedteam: vi.fn(),
  doRedteamRun: vi.fn(),
  loadApiProvider: vi.fn(),
  loadApiProviders: vi.fn(),
  loadDefaultConfig: vi.fn(),
  resolveConfigs: vi.fn(),
  synthesizeFromTestSuite: vi.fn(),
}));

vi.mock('../../../../src/commands/eval', () => ({
  doEval: securityGuardMocks.doEval,
}));

vi.mock('../../../../src/testCase/synthesis', () => ({
  synthesizeFromTestSuite: securityGuardMocks.synthesizeFromTestSuite,
}));

vi.mock('../../../../src/types/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/types/index')>();
  return {
    ...actual,
    TestSuiteSchema: { safeParse: vi.fn(() => ({ success: true })) },
    UnifiedConfigSchema: { safeParse: vi.fn(() => ({ success: true })) },
  };
});

vi.mock('../../../../src/util/config/default', () => ({
  loadDefaultConfig: securityGuardMocks.loadDefaultConfig,
}));

vi.mock('../../../../src/util/config/load', () => ({
  ConfigResolutionError: class ConfigResolutionError extends Error {
    cliMessage: string;

    constructor(cliMessage: string) {
      super(cliMessage);
      this.cliMessage = cliMessage;
    }
  },
  resolveConfigs: securityGuardMocks.resolveConfigs,
}));

vi.mock('../../../../src/redteam/commands/generate', () => ({
  doGenerateRedteam: securityGuardMocks.doGenerateRedteam,
}));

vi.mock('../../../../src/redteam/shared', () => ({
  doRedteamRun: securityGuardMocks.doRedteamRun,
}));

vi.mock('../../../../src/providers/index', () => ({
  loadApiProvider: securityGuardMocks.loadApiProvider,
  loadApiProviders: securityGuardMocks.loadApiProviders,
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

function writeDefaultConfig(config: Record<string, unknown>) {
  const configPath = path.join(process.cwd(), 'promptfooconfig.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  return configPath;
}

describe('MCP tool security guards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    securityGuardMocks.doEval.mockResolvedValue(undefined);
    securityGuardMocks.synthesizeFromTestSuite.mockResolvedValue([{ name: 'Ada' }]);
    securityGuardMocks.loadDefaultConfig.mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
    });
    securityGuardMocks.resolveConfigs.mockResolvedValue({
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
    });
    securityGuardMocks.doGenerateRedteam.mockResolvedValue({
      defaultTest: { metadata: { entities: [], purpose: 'test' } },
      tests: [],
    });
    securityGuardMocks.doRedteamRun.mockResolvedValue({
      id: 'redteam-eval',
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        stats: { errors: 0, failures: 0, successes: 0 },
      }),
    });
    securityGuardMocks.loadApiProvider.mockResolvedValue({
      callApi: vi.fn().mockResolvedValue({ output: '9' }),
      id: 'mock-provider',
    });
    securityGuardMocks.loadApiProviders.mockResolvedValue([
      {
        callApi: vi.fn().mockResolvedValue({ output: '9' }),
        id: 'mock-provider',
      },
    ]);
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

  it('should reject test_provider option file references outside the workspace', async () => {
    const { loadApiProviders } = await import('../../../../src/providers/index');
    const { registerTestProviderTool } = await import(
      '../../../../src/commands/mcp/tools/testProvider'
    );
    const handler = captureToolHandler(registerTestProviderTool);

    const result = await handler({
      provider: {
        id: 'http://localhost:8080',
        config: { transformResponse: `file://${outsideWorkspacePath('evil-transform.js')}` },
      },
    });

    expect(result.isError).toBe(true);
    expect(parseToolResponse(result).error).toContain('Failed to test provider');
    expect(loadApiProviders).not.toHaveBeenCalled();
  });

  it('should reject run_evaluation config contents before resolving providers', async () => {
    const { resolveConfigs } = await import('../../../../src/util/config/load');
    const { registerRunEvaluationTool } = await import(
      '../../../../src/commands/mcp/tools/runEvaluation'
    );
    const handler = captureToolHandler(registerRunEvaluationTool);
    const configPath = `.mcp-containment-${Date.now()}.json`;

    fs.writeFileSync(
      path.join(process.cwd(), configPath),
      JSON.stringify({
        prompts: ['hello'],
        providers: [`file://${outsideWorkspacePath('evil-provider.js')}`],
      }),
    );

    try {
      const result = await handler({ configPath });

      expect(result.isError).toBe(true);
      expect(parseToolResponse(result).error).toContain('Path must be within base directory');
      expect(resolveConfigs).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(path.join(process.cwd(), configPath), { force: true });
    }
  });

  it('should reject run_evaluation implicit default config contents before loading defaults', async () => {
    const { loadDefaultConfig } = await import('../../../../src/util/config/default');
    const { registerRunEvaluationTool } = await import(
      '../../../../src/commands/mcp/tools/runEvaluation'
    );
    const handler = captureToolHandler(registerRunEvaluationTool);
    const configPath = writeDefaultConfig({
      prompts: ['hello'],
      providers: [`file://${outsideWorkspacePath('evil-provider.js')}`],
    });

    try {
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(parseToolResponse(result).error).toContain('Path must be within base directory');
      expect(loadDefaultConfig).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(configPath, { force: true });
    }
  });

  it('should reject redteam_generate implicit default configs before loading defaults', async () => {
    const { doGenerateRedteam } = await import('../../../../src/redteam/commands/generate');
    const { loadDefaultConfig } = await import('../../../../src/util/config/default');
    const { registerRedteamGenerateTool } = await import(
      '../../../../src/commands/mcp/tools/redteamGenerate'
    );
    const handler = captureToolHandler(registerRedteamGenerateTool);
    const configPath = writeDefaultConfig({
      prompts: ['hello'],
      providers: [`file://${outsideWorkspacePath('evil-provider.js')}`],
    });

    try {
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(parseToolResponse(result).error).toContain('Path must be within base directory');
      expect(loadDefaultConfig).not.toHaveBeenCalled();
      expect(doGenerateRedteam).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(configPath, { force: true });
    }
  });

  it('should reject redteam_run implicit default configs before starting scans', async () => {
    const { doRedteamRun } = await import('../../../../src/redteam/shared');
    const { loadDefaultConfig } = await import('../../../../src/util/config/default');
    const { registerRedteamRunTool } = await import(
      '../../../../src/commands/mcp/tools/redteamRun'
    );
    const handler = captureToolHandler(registerRedteamRunTool);
    const configPath = writeDefaultConfig({
      prompts: ['hello'],
      providers: [`file://${outsideWorkspacePath('evil-provider.js')}`],
    });

    try {
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(parseToolResponse(result).error).toContain('Path must be within base directory');
      expect(loadDefaultConfig).not.toHaveBeenCalled();
      expect(doRedteamRun).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(configPath, { force: true });
    }
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
