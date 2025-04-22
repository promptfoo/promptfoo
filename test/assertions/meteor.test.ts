import type { AssertionParams } from 'src/types';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

describe('METEOR score calculation', () => {

  it('identical sentences should have high METEOR score', async () => {
    const params = {
      assertion: { type: 'meteor', value: 'The cat sat on the mat' },
      renderedValue: 'The cat sat on the mat',
      outputString: 'The cat sat on the mat',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.95);
  });

  it('nltk example', async () => {
    const params = {
      assertion: { type: 'meteor' },
      renderedValue: 'It is a guide to action which ensures that the military always obeys the commands of the party',
      outputString: 'It is a guide to action that ensures the military will forever heed Party commands',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('should handle period after words', async () => {
    const params = {
      assertion: { type: 'meteor', value: 'The cat sat on the mat' },
      renderedValue: 'The cat sat on the mat',
      outputString: 'The cat sat on the mat.',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.95);
  });

  it('should handle non matching sentences', async () => {
    const params = {
      assertion: { type: 'meteor'},
      renderedValue: 'The cat sat on the mat',
      outputString: 'non matching hypothesis',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.5);
  });


  it('should handle multiple references', async () => {
    const params = {
      assertion: { type: 'meteor'},
      renderedValue: [
        'It is a guide to action that ensures that the military will forever heed Party commands',
        'It is the guiding principle which guarantees the military forces always being under the command of the Party',
        'It is the practical guide for the army always to heed the directions of the party'
      ],
      outputString: 'It is a guide to action which ensures that the military always obeys the commands of the party',
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.69);
  });

  it('should handle completely different sentences', async () => {
    const params = {
      assertion: { type: 'meteor', value: 'The cat sat on the mat' },
      renderedValue: 'The cat sat on the mat',
      outputString: 'The dog ran in the park',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.5);
  });

  it('should handle multiple references and take best matching score', async () => {
    const params = {
      assertion: { 
        type: 'meteor',
        value: [
          'The cat sat on the mat.',
          'There is a cat on the mat.',
          'A cat is sitting on the mat.'
        ]
      },
      renderedValue: [
        'The cat sat on the mat.',
        'There is a cat on the mat.',
        'A cat is sitting on the mat.'
      ],
      outputString: 'The cat was sitting on the mat.',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('should handle custom parameters', async () => {
    const params = {
      assertion: { 
        type: 'meteor',
        value: 'The cat sat on the mat',
        threshold: 0.75,
      },
      renderedValue: 'The cat sat on the mat',
      outputString: 'The cat is sitting on the mat',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('should handle inverse assertion', async () => {
    const params = {
      assertion: {
        type: 'meteor',
        value: 'The cat sat on the mat',
        threshold: 0.8
      },
      renderedValue: 'The cat sat on the mat',
      outputString: 'The dog ran in the park',
      inverse: true,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('should throw error for invalid inputs', async () => {
    const params = {
      assertion: { type: 'meteor', value: [] },
      renderedValue: [],
      outputString: 'test',
      inverse: false,
    } as AssertionParams;

    await expect(handleMeteorAssertion(params)).rejects.toThrow('Invalid inputs');
  });

  it('should use default threshold of 0.5', async () => {
    const params = {
      assertion: { type: 'meteor', value: 'The cat sat on the mat' },
      renderedValue: 'The cat sat on the mat',
      outputString: 'The dog ran in the park',
      inverse: false,
    } as AssertionParams;

    const result = await handleMeteorAssertion(params);
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.5);
    expect(result.reason).toMatch(/METEOR score \d+\.\d+ did not meet threshold 0\.5/);
  });
});
