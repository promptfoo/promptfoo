import { describe, expect, it } from 'vitest';
import { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { accumulateGradingTokenUsage, createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';

import type { OutputStripFlags } from '../../src/models/evalResult';
import type { GradingResult } from '../../src/types';

function gradingResult(cachedResponse: boolean): GradingResult {
  return {
    pass: true,
    score: 1,
    reason: 'Greeting matched',
    metadata: { cachedResponse, note: 'Private grading note' },
    tokensUsed: { total: 40, prompt: 30, completion: 10, cached: 40, numRequests: 0 },
  };
}

function accounting(result: GradingResult) {
  const usage = createEmptyTokenUsage();
  accumulateGradingTokenUsage(usage, result.tokensUsed, {
    cached: result.metadata?.cachedResponse,
  });
  return {
    logical: usage.assertions,
    incurred: usage.incurredTokenUsage?.assertions ?? usage.assertions,
  };
}

describe('grading accounting in artifacts', () => {
  it.each([
    { cached: false, stripMetadata: false },
    { cached: false, stripMetadata: true },
    { cached: true, stripMetadata: false },
    { cached: true, stripMetadata: true },
  ])(
    'preserves accounting with cached=$cached and stripMetadata=$stripMetadata',
    ({ cached, stripMetadata }) => {
      const source = {
        gradingResult: {
          ...gradingResult(cached),
          componentResults: [gradingResult(!cached)],
        },
      };
      const original = structuredClone(source);
      const flags: OutputStripFlags = {
        shouldStripPromptText: false,
        shouldStripResponseOutput: false,
        shouldStripTestVars: false,
        shouldStripGradingResult: false,
        shouldStripMetadata: stripMetadata,
      };

      const artifact = sanitizeResultForJsonlArtifact(source, flags);

      for (const [before, after] of [
        [source.gradingResult, artifact.gradingResult],
        [source.gradingResult.componentResults[0], artifact.gradingResult.componentResults[0]],
      ]) {
        expect(accounting(after)).toEqual(accounting(before));
        expect(after).toMatchObject({ pass: true, score: 1, reason: 'Greeting matched' });
        if (stripMetadata) {
          expect(after).not.toHaveProperty('metadata');
        } else {
          expect(after.metadata).toEqual(before.metadata);
        }
      }
      expect(source).toEqual(original);
    },
  );
});
