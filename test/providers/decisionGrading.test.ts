import { afterEach, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { matchesClassification } from '../../src/matchers/classification';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

const rubric = 'The response offers a refund.';
const instructions = 'Choose a topic.';
const labels = { returns: null, sales: 'Buying a new item' };
const probabilities = { returns: 0.8, sales: 0.2 };
const choice = { type: 'choice', choice: 'returns', confidence: 0.8, probabilities };
const noul = { type: 'noul', noul: 0.75, confidence: 0.75 };
const grade = { type: 'noul', instructions: rubric };
const classification = { type: 'choice', instructions };

function respond(data: unknown) {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    status: 200,
    statusText: 'OK',
    cached: false,
  });
}

function lastRequest() {
  return JSON.parse(String(vi.mocked(fetchWithCache).mock.calls.at(-1)?.[1]?.body));
}

const openAiResponse = (answer: unknown) => ({
  model: 'gpt-6-luna',
  answers: [answer],
  usage: { input_tokens: 12, output_tokens: 1, total_tokens: 13 },
});

it.each([
  {
    id: 'google:decisions:gemini-decision-1',
    inputField: 'input',
    gradeQuestion: { grade },
    gradeResponse: { answers: { grade: noul } },
    choiceQuestion: { classification: { ...classification, criteria: { ...labels, returns: '' } } },
    choiceResponse: { answers: { classification: choice } },
  },
  {
    id: 'typesafe:jev-latest',
    inputField: 'state',
    gradeQuestion: { grade },
    gradeResponse: JSON.stringify({ answers: { grade: noul } }),
    choiceQuestion: { classification: { ...classification, criteria: labels } },
    choiceResponse: JSON.stringify({ answers: { classification: choice } }),
  },
  {
    id: 'openai:decisions:gpt-6-luna',
    inputField: 'input',
    gradeQuestion: [{ name: 'grade', type: 'predicate', instructions: rubric }],
    gradeResponse: openAiResponse({ name: 'grade', type: 'predicate', probability: 0.75 }),
    choiceQuestion: [
      {
        ...classification,
        name: 'classification',
        choices: [{ value: 'returns' }, { value: 'sales', description: labels.sales }],
      },
    ],
    choiceResponse: openAiResponse({
      ...choice,
      name: 'classification',
      probabilities: [
        { value: 'returns', probability: 0.8 },
        { value: 'sales', probability: 0.2 },
      ],
    }),
  },
])('grades and classifies with the same config through $id', async (fixture) => {
  const grading = {
    provider: {
      id: fixture.id,
      config: { apiKey: 'test-key', threshold: 0.8, instructions, labels },
    },
  };
  const output = 'We will refund your purchase.';

  respond(fixture.gradeResponse);
  expect(await matchesLlmRubric(rubric, output, grading)).toMatchObject({
    pass: false,
    score: 0.75,
  });
  const gradeRequest = lastRequest();
  expect(gradeRequest[fixture.inputField]).toBe(output);
  expect(gradeRequest.questions).toEqual(fixture.gradeQuestion);

  respond(fixture.choiceResponse);
  expect(await matchesClassification('sales', output, 0.15, grading)).toMatchObject({
    pass: true,
    score: 0.2,
  });
  const choiceRequest = lastRequest();
  expect(choiceRequest[fixture.inputField]).toBe(output);
  expect(choiceRequest.questions).toEqual(fixture.choiceQuestion);
});
