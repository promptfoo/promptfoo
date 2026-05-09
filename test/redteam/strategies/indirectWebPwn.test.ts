import { describe, expect, it } from 'vitest';
import { addIndirectWebPwnTestCases } from '../../../src/redteam/strategies/indirectWebPwn';

describe('addIndirectWebPwnTestCases', () => {
  it('assigns stable per-row ids in standalone mode', async () => {
    const result = await addIndirectWebPwnTestCases(
      [
        {
          vars: { prompt: 'first' },
          metadata: { pluginId: 'data-exfil' },
        },
        {
          vars: { prompt: 'second' },
          metadata: { pluginId: 'data-exfil' },
        },
      ],
      'prompt',
      {},
    );

    expect(result[0].metadata?.originalTestCaseId).toEqual(expect.any(String));
    expect(result[1].metadata?.originalTestCaseId).toEqual(expect.any(String));
    expect(result[0].metadata?.originalTestCaseId).not.toBe(result[1].metadata?.originalTestCaseId);
  });

  it('preserves an existing test id as the standalone fallback id', async () => {
    const result = await addIndirectWebPwnTestCases(
      [
        {
          vars: { prompt: 'first' },
          metadata: { pluginId: 'data-exfil', testCaseId: 'existing-row' },
        },
      ],
      'prompt',
      {},
    );

    expect(result[0].metadata?.originalTestCaseId).toBe('existing-row');
  });
});
