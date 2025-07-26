import type { Assertion } from '../../src/types';
import { runAssertions } from '../../src/assertions';

describe('max-score assertion integration', () => {
  it('should exclude max-score from regular assertion processing', async () => {
    const test = {
      assert: [
        { type: 'contains', value: 'test' } as Assertion,
        { type: 'max-score' } as Assertion,
      ],
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      test,
    });

    // Only the contains assertion should be processed
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults![0].assertion?.type).toBe('contains');
  });

  it('should filter out select-best and max-score from processing', async () => {
    const test = {
      assert: [
        { type: 'contains', value: 'test' } as Assertion,
        { type: 'select-best', value: 'best criteria' } as Assertion,
        { type: 'max-score' } as Assertion,
        { type: 'equals', value: 'test output' } as Assertion,
      ],
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      test,
    });

    // Only contains and equals should be processed
    expect(result.componentResults).toHaveLength(2);
    const processedTypes = result.componentResults!.map((cr) => cr.assertion?.type);
    expect(processedTypes).toEqual(['contains', 'equals']);
  });
});
