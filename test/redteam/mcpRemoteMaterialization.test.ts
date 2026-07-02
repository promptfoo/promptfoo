import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { getEnvBool, getEnvInt, getEnvString } from '../../src/envars';
import { getUserEmail, isLoggedIntoCloud } from '../../src/globalConfig/accounts';
import { materializeMcpToolCallRemote } from '../../src/redteam/extraction/util';

vi.mock('../../src/cache');
vi.mock('../../src/envars');
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    CloudConfig: class {
      isEnabled() {
        return false;
      }
      getApiHost() {
        return 'https://api.promptfoo.app';
      }
    },
  };
});

describe('materializeMcpToolCallRemote', () => {
  const searchCompaniesTool = {
    name: 'search_companies',
    description: 'Search sample company records.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    cliState.remote = undefined;
    vi.mocked(getUserEmail).mockReturnValue('test@example.com');
    vi.mocked(isLoggedIntoCloud).mockReturnValue(false);
    vi.mocked(getEnvInt).mockReturnValue(300_000);
    vi.mocked(getEnvString).mockReturnValue('');
    vi.mocked(getEnvBool).mockReturnValue(false);
  });

  it('returns normalized MCP JSON from the remote task server', async () => {
    vi.mocked(getEnvString).mockImplementation((key: string) =>
      key === 'PROMPTFOO_REMOTE_GENERATION_URL' ? 'https://remote.example.test/task' : '',
    );
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: {
          tool: 'search_companies',
          args: { query: 'clean energy' },
        },
      },
      status: 200,
      statusText: 'OK',
    } as Awaited<ReturnType<typeof fetchWithCache>>);

    const result = await materializeMcpToolCallRemote({
      intentValue: 'Find clean energy companies.',
      purpose: 'Search companies',
      tools: [searchCompaniesTool],
      value: 'Find clean energy companies.',
    });

    expect(JSON.parse(result ?? '')).toEqual({
      tool: 'search_companies',
      args: { query: 'clean energy' },
    });
    expect(JSON.parse((vi.mocked(fetchWithCache).mock.calls[0][1] as any).body)).toMatchObject({
      email: 'test@example.com',
      jsonOnly: true,
      mcpMaterializationContext: {
        intentValue: 'Find clean energy companies.',
        purpose: 'Search companies',
        tools: [searchCompaniesTool],
      },
      preferSmallModel: false,
      prompt: 'Find clean energy companies.',
      task: 'mcp-materialization',
    });
  });

  it('returns undefined when local credentials are available and remote generation is not selected', async () => {
    vi.mocked(getEnvString).mockImplementation((key: string) =>
      key === 'OPENAI_API_KEY' ? 'sk-local' : '',
    );

    await expect(
      materializeMcpToolCallRemote({
        tools: [searchCompaniesTool],
        value: 'Find clean energy companies.',
      }),
    ).resolves.toBeUndefined();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('returns undefined when remote generation is explicitly disabled', async () => {
    vi.mocked(getEnvBool).mockImplementation(
      (key: string) => key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION',
    );

    await expect(
      materializeMcpToolCallRemote({
        tools: [searchCompaniesTool],
        value: 'Find clean energy companies.',
      }),
    ).resolves.toBeUndefined();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('includes target context in the remote task body', async () => {
    vi.mocked(getEnvString).mockImplementation((key: string) =>
      key === 'PROMPTFOO_REMOTE_GENERATION_URL' ? 'https://remote.example.test/task' : '',
    );
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: {
          tool: 'search_companies',
          args: { query: 'cloud' },
        },
      },
      status: 200,
      statusText: 'OK',
    } as Awaited<ReturnType<typeof fetchWithCache>>);

    await materializeMcpToolCallRemote({
      targetId: 'cloud-target-123',
      tools: [searchCompaniesTool],
      value: 'Find cloud companies.',
    });

    expect(JSON.parse((vi.mocked(fetchWithCache).mock.calls[0][1] as any).body)).toMatchObject({
      targetId: 'cloud-target-123',
    });
  });

  it('rejects invalid remote materialization output', async () => {
    vi.mocked(getEnvString).mockImplementation((key: string) =>
      key === 'PROMPTFOO_REMOTE_GENERATION_URL' ? 'https://remote.example.test/task' : '',
    );
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: {
          tool: 'unknown_tool',
          args: {},
        },
      },
      status: 200,
      statusText: 'OK',
    } as Awaited<ReturnType<typeof fetchWithCache>>);

    await expect(
      materializeMcpToolCallRemote({
        tools: [searchCompaniesTool],
        value: 'Find clean energy companies.',
      }),
    ).rejects.toThrow('Remote MCP materialization failed');
  });
});
