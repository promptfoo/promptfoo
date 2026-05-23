import { describe, expect, it } from 'vitest';
import { selectGreedyPortfolio } from '../../../scripts/redteam-research/semanticBandSelectionShared';

describe('semanticBandSelectionShared', () => {
  it('selects the highest-scoring remaining candidate at each step', () => {
    expect(
      selectGreedyPortfolio(
        [
          { id: 'a', score: 1 },
          { id: 'b', score: 3 },
          { id: 'c', score: 2 },
        ],
        2,
        (candidate) => candidate.score,
      ).map((candidate) => candidate.id),
    ).toEqual(['b', 'c']);
  });
});
