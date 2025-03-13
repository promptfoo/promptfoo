import type { GradingConfig } from '../../dist/src/types.js';
import { installJestMatchers } from './matchers';

installJestMatchers();

describe('toMatchSemanticSimilarity', () => {
  it('should pass when strings are semantically similar', async () => {
    await expect('The quick brown fox').toMatchSemanticSimilarity('A fast brown fox');
  });

  it('should fail when strings are not semantically similar', async () => {
    await expect('The quick brown fox').not.toMatchSemanticSimilarity('The weather is nice today');
  });

  it('should pass when strings are semantically similar with custom threshold', async () => {
    await expect('The quick brown fox').toMatchSemanticSimilarity('A fast brown fox', 0.7);
  });

  it('should fail when strings are not semantically similar with custom threshold', async () => {
    await expect('The quick brown fox').not.toMatchSemanticSimilarity(
      'The weather is nice today',
      0.9,
    );
  });
});

const gradingConfig: GradingConfig = {
  provider: 'openai:chat:gpt-4o-mini',
};

describe('toPassLLMRubric', () => {
  it('should pass when strings meet the LLM Rubric criteria', async () => {
    await expect('Four score and seven years ago').toPassLLMRubric(
      'Contains part of a famous speech',
      gradingConfig,
    );
  });

  it('should fail when strings do not meet the LLM Rubric criteria', async () => {
    await expect('It is time to do laundry').not.toPassLLMRubric(
      'Contains part of a famous speech',
      gradingConfig,
    );
  });
});
