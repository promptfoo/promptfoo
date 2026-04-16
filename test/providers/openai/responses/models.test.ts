// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it } from 'vitest';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

const expectedAudioModels = ['gpt-audio-1.5', 'gpt-audio-mini-2025-12-15'] as const;

describe('OpenAiResponsesProvider model registry', () => {
  it('should support various model names', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-2025-04-14');
    // GPT-5 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.2-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.3-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-2026-03-05');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-mini-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-nano-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-pro-2026-03-05',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-mini');
    for (const model of expectedAudioModels) {
      expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(model);
    }
    // GPT-4.5 models deprecated as of 2025-07-14, removed from API
  });

  it('should support the latest o-series reasoning models', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-2025-04-16');
  });

  it('should support gpt-4.1 and its variants', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-2025-04-14');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-4.1-mini-2025-04-14',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-4.1-nano-2025-04-14',
    );
  });

  it('should support gpt-5 and its variants', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-mini');
  });

  it('should include all expected model names', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-08-06');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-11-20');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-05-13');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-2024-12-17');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-preview');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-preview-2024-09-12');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-mini-2024-09-12');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro-2025-03-19');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro-2025-06-10');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini-2025-01-31');
    // GPT-4.5 models deprecated as of 2025-07-14, removed from API
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('codex-mini-latest');
    // GPT-5.1 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.1-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.1-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.1-codex');
    // GPT-5.2 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.2-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.2-codex');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.2-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.2-pro-2025-12-11',
    );
    // GPT-5.3 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.3-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.3-codex');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.3-codex-spark');
    // GPT-5.4 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-2026-03-05');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-mini-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-nano-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-pro-2026-03-05',
    );
    // Audio models
    for (const model of expectedAudioModels) {
      expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(model);
    }
    // Deep research models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-deep-research');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'o3-deep-research-2025-06-26',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-deep-research');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'o4-mini-deep-research-2025-06-26',
    );
  });
});
