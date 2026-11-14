import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerValidatePromptfooConfigTool } from '../../../../src/commands/mcp/tools/validatePromptfooConfig';
import { loadDefaultConfig } from '../../../../src/util/config/default';
import { resolveConfigs } from '../../../../src/util/config/load';

vi.mock('../../../../src/util/config/default', () => ({
  loadDefaultConfig: vi.fn(),
}));

vi.mock('../../../../src/util/config/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/util/config/load')>()),
  resolveConfigs: vi.fn(),
}));

describe('validate_promptfoo_config tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
  });

  it('returns non-strict unknown-key diagnostics to MCP clients', async () => {
    vi.mocked(resolveConfigs).mockResolvedValue({
      basePath: '',
      config: {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [],
      },
      strictConfigEnabled: false,
      testSuite: {
        prompts: [{ raw: 'hello', label: 'hello' }],
        providers: [],
        tests: [],
      },
      unknownConfigKeyDiagnostics: [
        { configPath: 'test.yaml', unknownTopLevelKeys: ['outptPath'] },
      ],
    });

    let handler: ((args: { configPaths?: string[] }) => Promise<any>) | undefined;
    registerValidatePromptfooConfigTool({
      tool: vi.fn((_name, _schema, toolHandler) => {
        handler = toolHandler;
      }),
    } as any);

    const result = await handler!({ configPaths: ['test.yaml'] });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.data.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Unknown top-level config key(s) "outptPath"'),
      ]),
    );
  });
});
