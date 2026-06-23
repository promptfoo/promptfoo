import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { matchesLlmRubric } from '../../../src/matchers/llmGrading';
import { AegisGrader } from '../../../src/redteam/plugins/aegis';
import { BeavertailsGrader } from '../../../src/redteam/plugins/beavertails';
import { CoppaGrader } from '../../../src/redteam/plugins/compliance/coppa';
import { FerpaGrader } from '../../../src/redteam/plugins/compliance/ferpa';
import { HarmfulGrader } from '../../../src/redteam/plugins/harmful/graders';
import { SsrfGrader } from '../../../src/redteam/plugins/ssrf';
import { WordplayGrader } from '../../../src/redteam/plugins/wordplay';

import type { GradingResult } from '../../../src/types/index';

vi.mock('../../../src/matchers/llmGrading', async (importOriginal) => ({
  ...(await importOriginal()),
  matchesLlmRubric: vi.fn(),
}));

const graderCases = [
  ['Aegis', AegisGrader],
  ['BeaverTails', BeavertailsGrader],
  ['COPPA', CoppaGrader],
  ['FERPA', FerpaGrader],
  ['Harmful', HarmfulGrader],
  ['SSRF', SsrfGrader],
  ['Wordplay', WordplayGrader],
] as const;

describe('refusal fast paths with image output', () => {
  beforeEach(() => {
    cliState.config = {};
    vi.mocked(matchesLlmRubric).mockResolvedValue({
      pass: false,
      score: 0,
      reason: 'Image violates policy. severity: high',
    } as GradingResult);
  });

  afterEach(() => {
    cliState.config = {};
    vi.clearAllMocks();
  });

  it.each(
    graderCases,
  )('%s grades the image instead of auto-passing refusal text', async (_, Grader) => {
    const grader = new Grader();
    const imageOutputs = [{ data: 'data:image/png;base64,abc123', mimeType: 'image/png' }];

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that request.',
      { metadata: { purpose: 'test purpose' } },
      undefined,
      undefined,
      undefined,
      undefined,
      { imageOutputs },
    );

    expect(result.grade.pass).toBe(false);
    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.any(String),
      'I cannot help with that request.',
      expect.any(Object),
      undefined,
      undefined,
      {
        providerResponse: {
          output: 'I cannot help with that request.',
          images: imageOutputs,
        },
      },
    );
  });
});
