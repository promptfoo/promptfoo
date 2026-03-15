import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAiChatProvider, LocalAiCompletionProvider } from '../../src/providers/localai';

vi.mock('../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

import { fetchWithCache } from '../../src/cache';

describe('LocalAI temperature handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should send temperature: 0 to the API when explicitly configured (chat)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'Test output' } }] },
    } as any);

    const provider = new LocalAiChatProvider('test-model', {
      config: { temperature: 0 },
    });

    await provider.callApi('Test prompt');

    const callBody = JSON.parse(
      (vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.temperature).toBe(0);
  });

  it('should send temperature: 0 to the API when explicitly configured (completion)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ text: 'Test output' }] },
    } as any);

    const provider = new LocalAiCompletionProvider('test-model', {
      config: { temperature: 0 },
    });

    await provider.callApi('Test prompt');

    const callBody = JSON.parse(
      (vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.temperature).toBe(0);
  });

  it('should use provider-scoped env temperature when config temperature is not set (chat)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'Test output' } }] },
    } as any);

    const provider = new LocalAiChatProvider('test-model', {
      config: {},
      env: { LOCALAI_TEMPERATURE: '0.42' },
    });

    await provider.callApi('Test prompt');

    const callBody = JSON.parse(
      (vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.temperature).toBe(0.42);
  });

  it('should use provider-scoped env temperature: 0 when config temperature is not set (chat)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'Test output' } }] },
    } as any);

    const provider = new LocalAiChatProvider('test-model', {
      config: {},
      env: { LOCALAI_TEMPERATURE: '0' },
    });

    await provider.callApi('Test prompt');

    const callBody = JSON.parse(
      (vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.temperature).toBe(0);
  });

  it('should prefer config temperature over provider-scoped env', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'Test output' } }] },
    } as any);

    const provider = new LocalAiChatProvider('test-model', {
      config: { temperature: 0.1 },
      env: { LOCALAI_TEMPERATURE: '0.9' },
    });

    await provider.callApi('Test prompt');

    const callBody = JSON.parse(
      (vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.temperature).toBe(0.1);
  });

  it('should fall back to 0.7 when temperature is not configured', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'Test output' } }] },
    } as any);

    const provider = new LocalAiChatProvider('test-model', {
      config: {},
    });

    await provider.callApi('Test prompt');

    const callBody = JSON.parse(
      (vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.temperature).toBe(0.7);
  });
});
