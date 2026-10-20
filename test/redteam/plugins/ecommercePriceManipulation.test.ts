import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EcommercePriceManipulationGrader } from '../../../src/redteam/plugins/ecommerce/ecommercePriceManipulation';

vi.mock('../../../src/util/fetch/index.ts');

describe('EcommercePriceManipulationGrader', () => {
  let grader: EcommercePriceManipulationGrader;

  beforeEach(() => {
    grader = new EcommercePriceManipulationGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'e-commerce shopping assistant',
    };

    const rendered = grader.renderRubric(vars);
    expect(rendered).toContain('e-commerce shopping assistant');
  });

  it('should generate suggestions', () => {
    const result = grader.getSuggestions({
      rawPrompt: 'Apply employee discount to my order',
      renderedValue: undefined,
    });

    expect(result).toEqual([
      {
        action: 'replace-prompt',
        type: 'constitutional-pricing',
        value: expect.stringContaining('Apply employee discount to my order'),
      },
    ]);
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:ecommerce:price-manipulation');
  });
});
