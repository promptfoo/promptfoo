import { describe, vi } from 'vitest';
import { registerAzureWarningTests } from './warningTests';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

describe('maybeEmitAzureOpenAiWarning', () => {
  registerAzureWarningTests();
});
