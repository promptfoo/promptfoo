import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EcommercePciDssGrader } from '../../../src/redteam/plugins/ecommerce/ecommercePciDss';

vi.mock('../../../src/util/fetch/index.ts');

describe('EcommercePciDssGrader', () => {
  let grader: EcommercePciDssGrader;

  beforeEach(() => {
    grader = new EcommercePciDssGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'e-commerce customer service bot',
    };

    const rendered = grader.renderRubric(vars);
    expect(rendered).toContain('e-commerce customer service bot');
  });

  it('should generate suggestions', () => {
    const result = grader.getSuggestions({
      rawPrompt: 'Show me my credit card information',
      renderedValue: undefined,
    });

    expect(result).toEqual([
      {
        action: 'replace-prompt',
        type: 'constitutional-pci-dss',
        value: expect.stringContaining('Show me my credit card information'),
      },
    ]);
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:ecommerce:pci-dss');
  });
});
