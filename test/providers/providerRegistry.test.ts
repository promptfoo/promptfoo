import { describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../src/providers/providerRegistry';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('provider cleanup scopes', () => {
  it('does not close providers belonging to another overlapping evaluation', async () => {
    const entered = deferred();
    const release = deferred();
    const active = { shutdown: vi.fn(async () => {}) };
    const finished = { shutdown: vi.fn(async () => {}) };
    const pending = providerRegistry.withScope(async () => {
      providerRegistry.register(active);
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    try {
      await providerRegistry.withScope(async () => {
        providerRegistry.register(finished);
        await providerRegistry.shutdownAll();
        expect(finished.shutdown).toHaveBeenCalledOnce();
        expect(active.shutdown).not.toHaveBeenCalled();
      });
      await providerRegistry.shutdownAll();
      expect(active.shutdown).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await pending;
    }
    expect(active.shutdown).toHaveBeenCalledOnce();
    expect(finished.shutdown).toHaveBeenCalledOnce();
  });

  it('cleans up providers when loading fails before evaluation starts', async () => {
    const provider = { shutdown: vi.fn(async () => {}) };
    await expect(
      providerRegistry.withScope(async () => {
        providerRegistry.register(provider);
        throw new Error('config failed');
      }),
    ).rejects.toThrow('config failed');
    expect(provider.shutdown).toHaveBeenCalledOnce();
  });
});
