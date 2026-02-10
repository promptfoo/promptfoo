import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, ProviderResponse } from '../../../src/types/providers';
import type { TestCaseWithPlugin } from '../../../src/types/index';

// Mock network calls
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithRetries: vi.fn(),
}));

vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn().mockReturnValue('test@example.com'),
}));

vi.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: vi.fn().mockReturnValue('https://api.example.com/task'),
}));

import { fetchWithRetries } from '../../../src/util/fetch/index';
import {
  addMcpShadowTestCases,
  clearProbeState,
  endProbe,
  getMcpShadowGradingSignals,
} from '../../../src/redteam/strategies/mcpShadow';

const mockFetch = vi.mocked(fetchWithRetries);

function makeTestCase(overrides?: Partial<TestCaseWithPlugin>): TestCaseWithPlugin {
  return {
    vars: { prompt: 'List my files' },
    assert: [{ type: 'llm-rubric', value: 'test', metric: 'TestMetric' }],
    metadata: {},
    ...overrides,
  } as TestCaseWithPlugin;
}

function mockStartProbeResponse(probeId = 'probe-1') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      result: {
        probeId,
        exfilUrl: `https://api.example.com/exfil/token-${probeId}`,
        payload: { tool: 'test_tool', injection: 'injected text' },
      },
    }),
  } as Response);
}

describe('addMcpShadowTestCases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProbeState();
  });

  it('should throw if deploymentId is missing', async () => {
    await expect(
      addMcpShadowTestCases([makeTestCase()], 'prompt', {}),
    ).rejects.toThrow('MCP Shadow strategy requires config.deploymentId');
  });

  it('should set provider wrapper on each test case', async () => {
    mockStartProbeResponse('probe-1');
    mockStartProbeResponse('probe-2');

    const results = await addMcpShadowTestCases(
      [makeTestCase(), makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1', attackType: 'content-exfil' },
    );

    expect(results).toHaveLength(2);
    for (const tc of results) {
      expect(tc.provider).toBeDefined();
      expect(typeof (tc.provider as ApiProvider).id).toBe('function');
      expect((tc.provider as ApiProvider).id()).toBe('mcp-shadow:content-exfil');
    }
  });

  it('should set runSerially on each test case', async () => {
    mockStartProbeResponse();

    const results = await addMcpShadowTestCases(
      [makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    expect(results[0].options?.runSerially).toBe(true);
  });

  it('should set strategy metadata on each test case', async () => {
    mockStartProbeResponse();

    const results = await addMcpShadowTestCases(
      [makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1', attackType: 'tool-poisoning', technique: 'description-inject' },
    );

    const meta = results[0].metadata!;
    expect(meta.strategyId).toBe('mcp-shadow:tool-poisoning');
    expect(meta.scanId).toBeDefined();
    expect(meta.mcpShadowDeploymentId).toBe('dep-1');
    expect(meta.mcpShadowAttackType).toBe('tool-poisoning');
    expect(meta.mcpShadowTechnique).toBe('description-inject');
  });

  it('should append /McpShadow to assertion metrics', async () => {
    mockStartProbeResponse();

    const results = await addMcpShadowTestCases(
      [makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    expect(results[0].assert![0].metric).toBe('TestMetric/McpShadow');
  });

  it('should default attackType to content-exfil', async () => {
    mockStartProbeResponse();

    const results = await addMcpShadowTestCases(
      [makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    expect(results[0].metadata!.mcpShadowAttackType).toBe('content-exfil');
    expect((results[0].provider as ApiProvider).id()).toBe('mcp-shadow:content-exfil');
  });

  it('should preserve original prompt in vars', async () => {
    mockStartProbeResponse();

    const results = await addMcpShadowTestCases(
      [makeTestCase({ vars: { prompt: 'original prompt text' } })],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    expect(results[0].vars!.prompt).toBe('original prompt text');
  });

  it('should not call startProbe during strategy phase', async () => {
    // The strategy should NOT call startProbe — only annotate test cases.
    // startProbe is called later by the provider wrapper at runtime.
    const results = await addMcpShadowTestCases(
      [makeTestCase(), makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });
});

describe('provider wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProbeState();
  });

  it('should call startProbe then delegate to originalProvider', async () => {
    mockStartProbeResponse('probe-abc');

    const results = await addMcpShadowTestCases(
      [makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    const wrapper = results[0].provider as ApiProvider;

    const mockOriginalProvider: ApiProvider = {
      id: () => 'openai:gpt-4',
      callApi: vi.fn().mockResolvedValue({ output: 'agent response' } as ProviderResponse),
    };

    const metadata: Record<string, unknown> = {
      mcpShadowDeploymentId: 'dep-1',
      mcpShadowAttackType: 'content-exfil',
    };

    const result = await wrapper.callApi('test prompt', {
      vars: { prompt: 'test prompt' },
      prompt: { raw: 'test prompt', label: 'test' },
      originalProvider: mockOriginalProvider,
      test: { vars: { prompt: 'test prompt' }, metadata },
    });

    // startProbe was called
    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(fetchBody.task).toBe('mcp-start-probe');
    expect(fetchBody.deploymentId).toBe('dep-1');

    // originalProvider was called
    expect(mockOriginalProvider.callApi).toHaveBeenCalledOnce();

    // probeId was stored in metadata
    expect(metadata.mcpShadowProbeId).toBe('probe-abc');

    // Result is from originalProvider
    expect(result.output).toBe('agent response');
  });

  it('should return error if no originalProvider in context', async () => {
    const results = await addMcpShadowTestCases(
      [makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    const wrapper = results[0].provider as ApiProvider;
    const result = await wrapper.callApi('test prompt', {
      vars: {},
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(result.error).toContain('No original provider');
  });

  it('should set mcpShadowSetupFailed on startProbe failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    const results = await addMcpShadowTestCases(
      [makeTestCase()],
      'prompt',
      { deploymentId: 'dep-1' },
    );

    const wrapper = results[0].provider as ApiProvider;

    const mockOriginalProvider: ApiProvider = {
      id: () => 'openai:gpt-4',
      callApi: vi.fn(),
    };

    const metadata: Record<string, unknown> = {};

    const result = await wrapper.callApi('test prompt', {
      vars: {},
      prompt: { raw: 'test prompt', label: 'test' },
      originalProvider: mockOriginalProvider,
      test: { vars: {}, metadata },
    });

    expect(result.error).toContain('Failed to start probe');
    expect(metadata.mcpShadowSetupFailed).toBe(true);
    expect(metadata.mcpShadowError).toContain('500');
    // originalProvider should NOT have been called
    expect(mockOriginalProvider.callApi).not.toHaveBeenCalled();
  });
});

describe('endProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call mcp-end-probe task and return grading signals', async () => {
    const signals = {
      probeId: 'probe-1',
      honeypotTriggered: true,
      honeypotCalls: [],
      exfilDetected: false,
      exfilAttempts: [],
      toolCalls: [],
      technique: null,
      payload: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { gradingSignals: signals } }),
    } as Response);

    const result = await endProbe('probe-1');

    expect(result).toEqual(signals);
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(fetchBody.task).toBe('mcp-end-probe');
    expect(fetchBody.probeId).toBe('probe-1');
  });
});

describe('getMcpShadowGradingSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server error',
    } as Response);

    const result = await getMcpShadowGradingSignals('probe-bad');
    expect(result).toBeNull();
  });
});
