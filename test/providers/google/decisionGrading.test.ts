import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { matchesClassification } from '../../../src/matchers/classification';
import { matchesLlmRubric } from '../../../src/matchers/llmGrading';
import { GoogleDecisionsProvider } from '../../../src/providers/google/decisions';

import type { DecisionGradingConfig } from '../../../src/providers/decisionGrading';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

function provider(config: DecisionGradingConfig = {}) {
  return new GoogleDecisionsProvider('gemini-decision-1', {
    config: { apiKey: 'test-key', ...config },
  });
}

function respond(answers: Record<string, unknown>) {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: { answers, usage: { total_input_tokens: 25, total_output_tokens: 0, total_tokens: 25 } },
    status: 200,
    statusText: 'OK',
    cached: false,
  });
}

afterEach(() => vi.resetAllMocks());

describe('Gemini Decisions grading', () => {
  it('uses literal rubric instructions and evaluated output for a yes/no decision', async () => {
    respond({ grade: { type: 'noul', confidence: 0.8, noul: 0.8 } });
    const result = await matchesLlmRubric(
      'Mentions {{literal}}',
      'I saw {{literal}}.',
      {
        provider: provider(),
      },
      { literal: 'unexpected' },
    );
    expect(result).toMatchObject({ pass: true, score: 0.8, tokensUsed: { total: 25 } });
    expect(JSON.parse(String(vi.mocked(fetchWithCache).mock.calls[0][1]?.body))).toMatchObject({
      input: 'I saw {{literal}}.',
      questions: { grade: { type: 'noul', instructions: 'Mentions {{literal}}' } },
    });
  });

  it('normalizes an ordered score before applying the provider threshold', async () => {
    const levels = ['Incorrect', 'Partially correct', 'Correct'];
    respond({
      grade: {
        type: 'score',
        score: 1.5,
        confidence: 0.5,
        probabilities: { 0: 0, 1: 0.5, 2: 0.5 },
        legend: { 0: levels[0], 1: levels[1], 2: levels[2] },
      },
    });
    const result = await matchesLlmRubric('How accurate is the answer?', 'Partly right', {
      provider: provider({ levels, threshold: 0.8 }),
    });
    expect(result).toMatchObject({ pass: false, score: 0.75 });
    expect(
      JSON.parse(String(vi.mocked(fetchWithCache).mock.calls[0][1]?.body)).questions.grade,
    ).toEqual({ type: 'score', criteria: levels, instructions: 'How accurate is the answer?' });
  });

  it('checks the requested classifier probability, including an unselected label', async () => {
    const instructions = 'Choose the topic';
    const input = '[{"type":"text","text":"Classify this JSON literally"}]';
    respond({
      classification: {
        type: 'choice',
        choice: 'billing',
        confidence: 0.7,
        probabilities: { billing: 0.7, account: 0.3 },
      },
    });
    const result = await matchesClassification('account', input, 0.2, {
      provider: provider({ instructions, labels: ['billing', 'account'] }),
    });
    expect(result).toMatchObject({ pass: true, score: 0.3, tokensUsed: { total: 25 } });
    expect(JSON.parse(String(vi.mocked(fetchWithCache).mock.calls[0][1]?.body))).toMatchObject({
      input,
      questions: {
        classification: { type: 'choice', instructions, criteria: { billing: '', account: '' } },
      },
    });
  });

  it('compares the full-precision score with the threshold from prompt config', async () => {
    const levels = ['Wrong', 'Right'];
    const score = 0.4999996;
    respond({
      grade: {
        type: 'score',
        score,
        confidence: 1 - score,
        probabilities: { 0: 1 - score, 1: score },
        legend: { 0: levels[0], 1: levels[1] },
      },
    });
    const result = await provider({ threshold: 0.4 }).callApi('', {
      isGrading: true,
      prompt: { raw: '', label: 'llm-rubric', config: { levels, threshold: 0.5 } },
      vars: { rubric: 'Is this correct?', output: 'Sometimes.' },
    });
    expect(result.output).toMatchObject({ pass: false, score });
  });

  it('reports matcher attachments as an error before grading a text placeholder', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    const result = await matchesLlmRubric(
      'The image shows a bus',
      image,
      { provider: provider() },
      {},
      undefined,
      { providerResponse: { output: image, images: [{ data: image, mimeType: 'image/png' }] } },
    );
    expect(result).toMatchObject({ pass: false, metadata: { graderError: true } });
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects unsupported grading tasks, missing rubric variables and invalid thresholds', async () => {
    const instance = provider({ threshold: 2 });
    const context = { isGrading: true, prompt: { raw: '', label: 'llm-rubric' }, vars: {} };
    expect(
      (await instance.callApi('', { ...context, prompt: { raw: '', label: 'factuality' } })).error,
    ).toContain('factuality');
    expect((await instance.callApi('', context)).error).toContain('rubric and output');
    expect(
      (await instance.callApi('', { ...context, vars: { rubric: 'Is correct', output: '1' } }))
        .error,
    ).toContain('threshold');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects repeated classifier labels before turning the list into choice criteria', async () => {
    const instance = provider({ instructions: 'Choose a label', labels: ['a', 'b', 'a'] });
    expect((await instance.callClassificationApi('text')).error).toContain('labels');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
