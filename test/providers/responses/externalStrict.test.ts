import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';
import { XAIResponsesProvider } from '../../../src/providers/xai/responses';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe.each([
  { name: 'Azure', Provider: AzureResponsesProvider },
  { name: 'xAI', Provider: XAIResponsesProvider },
])('$name external strict flag', ({ Provider }) => {
  it('renders an environment flag for a direct call and respects disabled templating', async () => {
    vi.stubEnv('PROMPTFOO_SCHEMA_STRICT_TEST', 'false');
    const directory = mkdtempSync(join(tmpdir(), 'promptfoo-response-format-'));
    try {
      const file = join(directory, 'format.json');
      const strict = '{{ env.PROMPTFOO_SCHEMA_STRICT_TEST }}';
      writeFileSync(
        file,
        JSON.stringify({
          type: 'json_schema',
          json_schema: { name: 'fixture', strict, schema: { type: 'object' } },
        }),
      );
      const api = new Provider('fixture', {
        config: {
          apiBaseUrl: 'https://example.test',
          apiKey: 'fixture',
          response_format: `file://${file}` as const,
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }],
        }),
      );

      await api.callApi('test');
      expect(
        JSON.parse(String(vi.mocked(fetchWithCache).mock.calls[0][1]?.body)).text.format.strict,
      ).toBe(false);

      vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATING', 'true');
      await expect(api.callApi('test')).rejects.toThrow('strict must be a boolean');
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not render template syntax introduced by a test variable', async () => {
    vi.stubEnv('PROMPTFOO_SCHEMA_STRICT_TEST', 'false');
    const api = new Provider('fixture', {
      config: {
        apiBaseUrl: 'https://example.test',
        apiKey: 'fixture',
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'fixture', strict: '{{ flag }}', schema: { type: 'object' } },
        },
      },
    });
    await expect(
      api.callApi('test', {
        vars: { flag: '{{ env.PROMPTFOO_SCHEMA_STRICT_TEST }}' },
        prompt: { raw: 'test', label: 'test' },
      }),
    ).rejects.toThrow('strict must be a boolean');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
