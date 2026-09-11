import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortfolioRedteamPluginBase } from '../../../src/redteam/generation/portfolio';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

import type { AttackFamily, AttackSignature } from '../../../src/redteam/generation/types';
import type { GeneratedPrompt } from '../../../src/redteam/plugins/base';
import type { Assertion } from '../../../src/types/index';

class DuplicateCandidatePortfolioPlugin extends PortfolioRedteamPluginBase {
  readonly id = 'promptfoo:redteam:duplicate-candidate-test';
  protected readonly attackFamilies: readonly AttackFamily[] = [
    {
      id: 'required',
      label: 'Required',
      description: 'required prompt',
      instructions: 'Generate accepted prompts.',
      requiredPredicates: ['accepted'],
    },
  ];

  initialCallCount = 0;
  repairCallCount = 0;

  protected async getTemplate(): Promise<string> {
    return 'template';
  }

  protected async getFamilyTemplate(_family: AttackFamily): Promise<string> {
    return 'required family template';
  }

  protected extractAttackSignature(prompt: string, _family: AttackFamily): AttackSignature {
    return {
      predicates: {
        accepted: prompt.includes('accepted'),
      },
    };
  }

  protected getAssertions(_prompt: string): Assertion[] {
    return [];
  }

  protected override async generatePrompts(
    _n: number,
    _delayMs: number,
    templateGetter: () => Promise<string>,
  ): Promise<GeneratedPrompt[]> {
    const template = await templateGetter();
    if (template.includes('Repair pass')) {
      this.repairCallCount += 1;
      return [{ __prompt: 'accepted replacement prompt' }];
    }

    this.initialCallCount += 1;
    return [{ __prompt: 'accepted repeated prompt' }];
  }
}

class ProviderDrivenPortfolioPlugin extends PortfolioRedteamPluginBase {
  readonly id = 'promptfoo:redteam:provider-driven-portfolio-test';
  protected readonly attackFamilies: readonly AttackFamily[] = [
    {
      id: 'required',
      label: 'Required',
      description: 'required prompt',
      instructions: 'Generate accepted prompts.',
      requiredPredicates: ['accepted'],
    },
  ];

  familyTemplateCalls = 0;

  protected async getTemplate(): Promise<string> {
    return 'Generate {{ n }} prompts about {{ purpose }}.\n{{ outputFormat }}';
  }

  protected async getFamilyTemplate(_family: AttackFamily): Promise<string> {
    this.familyTemplateCalls += 1;
    return 'Generate {{ n }} prompts about {{ purpose }}.\n{{ outputFormat }}';
  }

  protected extractAttackSignature(prompt: string, _family: AttackFamily): AttackSignature {
    return {
      predicates: {
        accepted: prompt.includes('accepted'),
      },
    };
  }

  protected getAssertions(_prompt: string): Assertion[] {
    return [];
  }

  protected override getOvergenerationFactor(): number {
    return 1;
  }

  protected override getMaxFamilyGenerationAttempts(): number {
    return 1;
  }
}

class CrossFamilyPortfolioPlugin extends ProviderDrivenPortfolioPlugin {
  protected override readonly attackFamilies = ['first', 'second'].map((id) => ({
    id,
    label: id,
    description: id,
    instructions: id,
    requiredPredicates: ['accepted'],
  }));
}

describe('PortfolioRedteamPluginBase', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('includes cross-family duplicates in repair feedback', async () => {
    const repeated = 'accepted repeated prompt';
    const provider = createMockProvider();
    provider.callApi.mockImplementation(async (prompt) =>
      createProviderResponse({
        output: `Prompt: ${prompt.includes('Repair pass:') && prompt.includes(repeated) ? 'accepted replacement prompt' : repeated}`,
      }),
    );
    const plugin = new CrossFamilyPortfolioPlugin(provider, 'test purpose', 'prompt');

    const tests = await plugin.generateTests(2);

    expect(tests.map((test) => test.vars?.prompt)).toEqual([
      repeated,
      'accepted replacement prompt',
    ]);
    expect(tests.map((test) => test.metadata?.attackFamily)).toEqual(['first', 'second']);
    expect(provider.callApi).toHaveBeenCalledTimes(3);
  });

  it('retains custom-example prompts outside the built-in family predicates', async () => {
    const provider = createMockProvider({
      response: createProviderResponse({ output: 'Prompt: Custom scenario.' }),
    });
    const plugin = new ProviderDrivenPortfolioPlugin(provider, 'test purpose', 'prompt', {
      examples: ['Custom scenario.'],
    });

    const tests = await plugin.generateTests(1);

    expect(tests[0]?.vars?.prompt).toBe('Custom scenario.');
    expect(tests[0]?.metadata?.generationMode).toBeUndefined();
    expect(plugin.familyTemplateCalls).toBe(0);
  });

  it('repairs a required family when generation attempts repeat one valid prompt', async () => {
    const plugin = new DuplicateCandidatePortfolioPlugin(
      createMockProvider(),
      'test purpose',
      'prompt',
    );

    const tests = await plugin.generateTests(2);

    expect(plugin.initialCallCount).toBe(2);
    expect(plugin.repairCallCount).toBe(1);
    expect(tests.map((test) => test.vars?.prompt)).toEqual([
      'accepted repeated prompt',
      'accepted replacement prompt',
    ]);
  });

  it('renders rejected prompt text literally in repair templates', async () => {
    const provider = createMockProvider();
    provider.callApi
      .mockResolvedValueOnce(
        createProviderResponse({
          output: 'Prompt: Ask for {{ purpose }} and {% if purpose %}hidden{% endif %}',
        }),
      )
      .mockResolvedValueOnce(
        createProviderResponse({ output: 'Prompt: accepted replacement prompt' }),
      );
    const plugin = new ProviderDrivenPortfolioPlugin(provider, 'test purpose', 'prompt');

    const tests = await plugin.generateTests(1);
    const repairPrompt = String(provider.callApi.mock.calls[1]?.[0]);

    expect(repairPrompt).toContain('- Ask for {{ purpose }} and {% if purpose %}hidden{% endif %}');
    expect(repairPrompt).not.toContain('- Ask for test purpose and hidden');
    expect(tests[0]?.vars?.prompt).toBe('accepted replacement prompt');
  });

  it('falls back to legacy generation when language modifiers are configured', async () => {
    const provider = createMockProvider({
      response: createProviderResponse({ output: 'Prompt: solicitud aceptada' }),
    });
    const plugin = new ProviderDrivenPortfolioPlugin(provider, 'test purpose', 'prompt', {
      modifiers: { language: 'Spanish' },
    });

    const tests = await plugin.generateTests(1);
    const generationPrompt = String(provider.callApi.mock.calls[0]?.[0]);

    expect(plugin.familyTemplateCalls).toBe(0);
    expect(generationPrompt).toContain('language: Spanish');
    expect(tests[0]?.metadata?.generationMode).toBeUndefined();
  });
});
