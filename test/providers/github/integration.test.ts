import { describe, expect, it } from 'vitest';
import { loadApiProvider } from '../../../src/providers/index';

describe('GitHub Models retired route', () => {
  it.each([
    'github:',
    'github:openai/gpt-5',
    'github:azureml/Phi-4',
  ])('rejects %s through the public loader', async (id) => {
    await expect(
      loadApiProvider(id, {
        options: { config: { apiKey: 'fixture-key' } },
      }),
    ).rejects.toThrow(/GitHub Models was retired on July 30, 2026/);
  });
});
