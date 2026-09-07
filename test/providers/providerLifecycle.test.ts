import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { AzureGenericProvider } from '../../src/providers/azure/generic';
import { AzureResponsesProvider } from '../../src/providers/azure/responses';
import { AIStudioChatProvider } from '../../src/providers/google/ai.studio';
import { MCPProvider } from '../../src/providers/mcp';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';

const mcp = vi.hoisted(() => ({ initialize: vi.fn(), cleanup: vi.fn(), callTool: vi.fn() }));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../src/providers/mcp/client', () => ({
  MCPClient: class {
    initialize = mcp.initialize;
    cleanup = mcp.cleanup;
    callTool = mcp.callTool;
    getAllTools() {
      return [];
    }
  },
}));
vi.mock('../../src/logger');

beforeEach(() => {
  vi.useFakeTimers();
  mcp.initialize.mockReset().mockResolvedValue(undefined);
  mcp.cleanup.mockReset().mockResolvedValue(undefined);
  mcp.callTool.mockReset().mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] });
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: {
      choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
      candidates: [{ content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' }],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  });
});

afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const options = { config: { apiKey: 'test-key', mcp: { enabled: true } } };
const providers = [
  ['OpenAI', () => new OpenAiChatCompletionProvider('gpt-4o-mini', options)],
  ['Azure chat', () => new AzureChatCompletionProvider('test-deployment', options)],
  ['Google', () => new AIStudioChatProvider('gemini-2.5-flash', options)],
  ['MCP', () => new MCPProvider({ config: { enabled: true } })],
] as const;

describe.each(providers)('%s MCP lifecycle', (_name, createProvider) => {
  it('releases connections through process shutdown, exactly once', async () => {
    const provider = createProvider();
    await providerRegistry.shutdownAll();
    await provider.cleanup();
    await providerRegistry.shutdownAll();
    expect(mcp.initialize).toHaveBeenCalledOnce();
    expect(mcp.cleanup).toHaveBeenCalledOnce();
  });

  it('waits for startup before cleanup and coalesces overlapping cleanup calls', async () => {
    const startup = createDeferred<void>();
    mcp.initialize.mockReturnValue(startup.promise);
    const provider = createProvider();
    const first = provider.cleanup();
    const second = providerRegistry.shutdownAll();
    await vi.runAllTimersAsync();
    expect(mcp.cleanup).not.toHaveBeenCalled();
    startup.resolve();
    await Promise.all([first, second]);
    expect(mcp.cleanup).toHaveBeenCalledOnce();
  });

  it('cleans up partial connections when eager startup fails', async () => {
    mcp.initialize.mockRejectedValue(new Error('server initialization failed'));
    const provider = createProvider();
    // Flush eager startup before any caller consumes its promise. Vitest also checks
    // that this does not produce an unhandled rejection.
    await vi.runAllTimersAsync();
    await providerRegistry.shutdownAll();
    await provider.cleanup();
    expect(mcp.cleanup).toHaveBeenCalledOnce();
  });

  it('reconnects and registers again when reused in a later evaluation', async () => {
    const provider = createProvider();
    const prompt = provider instanceof MCPProvider ? '{"tool":"hello"}' : 'hello';
    for (let run = 0; run < 2; run++) {
      const response = await providerRegistry.withScope([provider], () => provider.callApi(prompt));
      expect(response.error).toBeUndefined();
    }
    expect(mcp.initialize).toHaveBeenCalledTimes(2);
    expect(mcp.cleanup).toHaveBeenCalledTimes(2);
  });

  it('waits for pending cleanup before reconnecting on reuse', async () => {
    const provider = createProvider();
    const pending = createDeferred<void>();
    mcp.cleanup.mockReturnValueOnce(pending.promise);
    const cleanup = provider.cleanup();
    const prompt = provider instanceof MCPProvider ? '{"tool":"hello"}' : 'hello';
    const call = providerRegistry.withScope([provider], () => provider.callApi(prompt));
    await vi.runAllTimersAsync();
    expect(mcp.initialize).toHaveBeenCalledOnce();
    pending.resolve();
    await cleanup;
    expect((await call).error).toBeUndefined();
    expect(mcp.initialize).toHaveBeenCalledTimes(2);
    expect(mcp.cleanup).toHaveBeenCalledTimes(2);
  });

  it('surfaces initialization failures to callers', async () => {
    mcp.initialize.mockRejectedValue(new Error('server initialization failed'));
    const provider = createProvider();
    // MCP converts exceptions to ProviderResponse errors; the model providers throw.
    if (provider instanceof MCPProvider) {
      await expect(provider.callApi('{}')).resolves.toMatchObject({
        error: expect.stringContaining('server initialization failed'),
      });
    } else {
      await expect(provider.callApi('hello')).rejects.toThrow('server initialization failed');
    }
  });
});

describe.each([
  ['chat', AzureChatCompletionProvider],
  ['responses', AzureResponsesProvider],
] as const)('Azure %s authentication lifecycle', (_name, Provider) => {
  it('awaits authentication even when MCP initialization completes first', async () => {
    const authentication = createDeferred<Record<string, string>>();
    vi.spyOn(AzureGenericProvider.prototype, 'getAuthHeaders').mockReturnValue(
      authentication.promise,
    );
    const provider = new Provider('test-deployment', options);
    const initialized = vi.fn();
    const ready = provider.ensureInitialized().then(initialized);
    await vi.runAllTimersAsync();
    expect(initialized).not.toHaveBeenCalled();
    authentication.resolve({ 'api-key': 'test-key' });
    await ready;
    expect(provider.authHeaders).toEqual({ 'api-key': 'test-key' });
  });

  it('preserves authentication failures with MCP enabled', async () => {
    vi.spyOn(AzureGenericProvider.prototype, 'getAuthHeaders').mockRejectedValue(
      new Error('authentication failed'),
    );
    const provider = new Provider('test-deployment', options);
    await vi.runAllTimersAsync();
    await expect(provider.ensureInitialized()).rejects.toThrow('authentication failed');
  });
});

it('Azure chat readiness waits for MCP after authentication is ready', async () => {
  const startup = createDeferred<void>();
  mcp.initialize.mockReturnValue(startup.promise);
  const provider = new AzureChatCompletionProvider('test-deployment', options);
  const initialized = vi.fn();
  const ready = provider.ensureInitialized().then(initialized);
  await vi.runAllTimersAsync();
  expect(provider.authHeaders).toEqual({ 'api-key': 'test-key' });
  expect(initialized).not.toHaveBeenCalled();
  startup.resolve();
  await ready;
  expect(initialized).toHaveBeenCalledOnce();
});
