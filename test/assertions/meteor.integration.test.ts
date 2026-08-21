import { describe, expect, it } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

describe('METEOR assertions with natural', () => {
  it('combines real Porter stemming and WordNet synonym matching', async () => {
    const result = await handleMeteorAssertion({
      assertion: {
        type: 'meteor',
        value: 'walked sofa',
      },
      inverse: false,
      outputString: 'walking couch',
      renderedValue: 'walked sofa',
    });

    // Either stemming or synonym matching alone scores 0.25 for this pair. A score
    // above 0.9 proves the real dependency supplied both matches.
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.pass).toBe(true);
  });

  it('routes a real not-meteor assertion through the assertion pipeline', async () => {
    const { runAssertion } = await import('../../src/assertions/index');
    const result = await runAssertion({
      assertion: {
        type: 'not-meteor',
        value: 'walked sofa',
        threshold: 0.9,
      },
      providerResponse: { output: 'walking couch' },
      test: {},
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.1);
    expect(result.reason).toMatch(
      /^METEOR score \d\.\d{4} met threshold 0\.9 \(expected it not to\)$/,
    );
  });
});
