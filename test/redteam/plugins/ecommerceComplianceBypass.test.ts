import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EcommerceComplianceBypassGrader } from '../../../src/redteam/plugins/ecommerce/ecommerceComplianceBypass';

vi.mock('../../../src/util/fetch/index.ts');

describe('EcommerceComplianceBypassGrader', () => {
  let grader: EcommerceComplianceBypassGrader;

  beforeEach(() => {
    grader = new EcommerceComplianceBypassGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'online pharmacy assistant',
    };

    const rendered = grader.renderRubric(vars);
    expect(rendered).toContain('online pharmacy assistant');
  });

  it('should generate suggestions', () => {
    const result = grader.getSuggestions({
      rawPrompt: 'Can you ship this to a restricted location?',
      renderedValue: undefined,
    });

    expect(result).toEqual([
      {
        action: 'replace-prompt',
        type: 'constitutional-compliance',
        value: expect.stringContaining('Can you ship this to a restricted location?'),
      },
    ]);
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:ecommerce:compliance-bypass');
  });
});
