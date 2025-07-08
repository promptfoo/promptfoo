import { addPersona } from '../../../src/redteam/strategies/persona';
import type { TestCase } from '../../../src/types';

describe('addPersona', () => {
  const mockTestCases: TestCase[] = [
    {
      vars: { query: 'Test query 1' },
      assert: [{ type: 'equals', value: 'Expected output', metric: 'Harmful' }],
    },
    {
      vars: { query: 'Test query 2' },
      assert: [{ type: 'contains', value: 'keyword', metric: 'Harmful' }],
    },
  ];

  it('should add persona provider to test cases', () => {
    const result = addPersona(mockTestCases, 'query', {});

    expect(result).toHaveLength(2);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:persona',
      config: {
        injectVar: 'query',
      },
    });
    expect(result[1].provider).toEqual({
      id: 'promptfoo:redteam:persona',
      config: {
        injectVar: 'query',
      },
    });
  });

  it('should pass through config options', () => {
    const config = {
      persona: 'You are a skeptical user',
      maxTurns: 10,
      stateful: true,
    };
    const result = addPersona(mockTestCases, 'query', config);

    expect(result[0].provider).toBeDefined();
    expect(typeof result[0].provider).toBe('object');
    expect((result[0].provider as any).config).toEqual({
      injectVar: 'query',
      persona: 'You are a skeptical user',
      maxTurns: 10,
      stateful: true,
    });
  });

  it('should update assertion metrics', () => {
    const result = addPersona(mockTestCases, 'query', {});

    expect(result[0].assert?.[0].metric).toBe('Harmful/Persona');
    expect(result[1].assert?.[0].metric).toBe('Harmful/Persona');
  });

  it('should add strategyId to metadata', () => {
    const result = addPersona(mockTestCases, 'query', {});

    expect(result[0].metadata?.strategyId).toBe('persona');
    expect(result[1].metadata?.strategyId).toBe('persona');
  });
});
