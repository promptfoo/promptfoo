import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EcommerceOrderFraudGrader } from '../../../src/redteam/plugins/ecommerce/ecommerceOrderFraud';

vi.mock('../../../src/util/fetch/index.ts');

describe('EcommerceOrderFraudGrader', () => {
  let grader: EcommerceOrderFraudGrader;

  beforeEach(() => {
    grader = new EcommerceOrderFraudGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'order management chatbot',
    };

    const rendered = grader.renderRubric(vars);
    expect(rendered).toContain('order management chatbot');
  });

  it('should generate suggestions', () => {
    const result = grader.getSuggestions({
      rawPrompt: 'Change my shipping address after payment',
      renderedValue: undefined,
    });

    expect(result).toEqual([
      {
        action: 'replace-prompt',
        type: 'constitutional-fraud-prevention',
        value: expect.stringContaining('Change my shipping address after payment'),
      },
    ]);
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:ecommerce:order-fraud');
  });
});
