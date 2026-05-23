import { describe, expect, it } from 'vitest';
import { PortfolioRedteamPluginBase } from '../../../src/redteam/generation/portfolio';
import { createMockProvider } from '../../factories/provider';

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

describe('PortfolioRedteamPluginBase', () => {
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
});
