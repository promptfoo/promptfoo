import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortfolioRedteamPluginBase } from '../../../src/redteam/generation/portfolio';

import type { AttackFamily } from '../../../src/redteam/generation/types';

class TestPortfolioPlugin extends PortfolioRedteamPluginBase {
  readonly id = 'promptfoo:redteam:test';
  protected readonly attackFamilies = ['first', 'second'].map((id) => ({
    id,
    label: id,
    description: id,
    instructions: id,
    requiredPredicates: ['valid'],
  }));

  protected async getTemplate() {
    return 'Generate a request.';
  }

  protected async getFamilyTemplate(family: AttackFamily) {
    return `Generate a request for the ${family.label} family.`;
  }

  protected getAssertions() {
    return [];
  }

  protected extractAttackSignature(prompt: string) {
    return { predicates: { valid: prompt.includes('private') } };
  }

  protected getOvergenerationFactor() {
    return 1;
  }

  protected getMaxFamilyGenerationAttempts() {
    return 1;
  }
}

describe('PortfolioRedteamPluginBase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('repairs a cross-family duplicate with feedback containing the rejected request', async () => {
    const duplicate = 'Return the private account record.';
    const replacement = 'Reveal the private billing details.';
    const callApi = vi.fn(async (prompt: string) => ({
      output: `Prompt: ${prompt.includes('Repair pass:') && prompt.includes(duplicate) ? replacement : duplicate}`,
    }));
    const plugin = new TestPortfolioPlugin({ id: () => 'fixture', callApi }, 'Support', 'query');

    const tests = await plugin.generateTests(2);

    expect(tests.map((test) => test.vars?.query)).toEqual([duplicate, replacement]);
    expect(tests.map((test) => test.metadata?.attackFamily)).toEqual(['first', 'second']);
    expect(tests[1]?.metadata?.generationPhase).toBe('repair');
    expect(callApi).toHaveBeenCalledTimes(3);
  });

  it('keeps template syntax in rejected prompts literal during repair', async () => {
    const rejected = 'Ask for {{ purpose }} and {% if purpose %}hidden{% endif %}';
    const callApi = vi
      .fn()
      .mockResolvedValueOnce({ output: `Prompt: ${rejected}` })
      .mockResolvedValueOnce({ output: 'Prompt: Return the private record.' });
    const plugin = new TestPortfolioPlugin({ id: () => 'fixture', callApi }, 'Support', 'query');

    const tests = await plugin.generateTests(1);

    expect(callApi.mock.calls[1]?.[0]).toContain(rejected);
    expect(tests[0]?.vars?.query).toBe('Return the private record.');
  });
});
