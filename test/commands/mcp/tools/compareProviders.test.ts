import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { registerCompareProvidersTool } from '../../../../src/commands/mcp/tools/compareProviders';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../../../src/providers/index', () => ({
  loadApiProviders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function getInputSchema() {
  const tool = vi.fn();
  registerCompareProvidersTool({ tool } as unknown as McpServer);
  return z.object(tool.mock.calls[0][1] as z.ZodRawShape);
}

describe('compare_providers input validation', () => {
  it.each([2, 10])('accepts %i providers and applies the timeout default', (count) => {
    const providers = Array.from({ length: count }, () => 'echo');
    expect(getInputSchema().parse({ providers, testPrompt: 'hello' })).toEqual({
      providers,
      testPrompt: 'hello',
      timeoutMs: 30000,
    });
  });

  it('rejects too many providers before reading individual entries', () => {
    const providers = Array.from({ length: 11 }, () => 'echo');
    const readEntry = vi.fn(() => {
      throw new Error('Oversized input must not be traversed');
    });
    Object.defineProperty(providers, 0, { get: readEntry });

    const result = getInputSchema().safeParse({ providers, testPrompt: 'hello' });

    expect(readEntry).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          code: 'too_big',
          path: ['providers'],
          maximum: 10,
          message: 'Maximum 10 providers for comparison',
        }),
      ]);
    }
  });

  it.each([
    { providers: ['echo'], code: 'too_small', path: ['providers'] },
    { providers: ['echo', ''], code: 'too_small', path: ['providers', 1] },
  ])('still rejects invalid input within the size cap: $providers', ({ providers, code, path }) => {
    const result = getInputSchema().safeParse({ providers, testPrompt: 'hello' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ code, path }));
    }
  });
});
