import { describe, expect, it } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

describe('handleMeteorAssertion with natural', () => {
  it('combines real Porter stemming and WordNet synonym matching', async () => {
    const result = await handleMeteorAssertion({
      assertion: {
        type: 'meteor',
        value: 'walked car',
      },
      inverse: false,
      outputString: 'walking automobile',
      renderedValue: 'walked car',
    });

    // Either stemming or synonym matching alone scores 0.25 for this pair. A score
    // above 0.9 proves the real dependency supplied both matches.
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.pass).toBe(true);
  });
});
