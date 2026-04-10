import { describe, expect, it, vi } from 'vitest';
import { mockBrowserProperty, restoreBrowserMocks } from './browserMocks';

describe('browserMocks', () => {
  it('restores original properties after spies wrap mocked values', () => {
    const target = {
      open: () => 'original',
    };

    mockBrowserProperty(
      target,
      'open',
      vi.fn(() => 'mocked'),
    );
    vi.spyOn(target, 'open').mockImplementation(() => 'spied');

    vi.restoreAllMocks();
    restoreBrowserMocks();

    expect(target.open()).toBe('original');
  });
});
