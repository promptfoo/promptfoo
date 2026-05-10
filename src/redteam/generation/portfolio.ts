import logger from '../../logger';
import { RedteamPluginBase, type GeneratedPrompt } from '../plugins/base';
import { getShortPluginId } from '../util';
import { buildBalancedAttackPlan, selectCoverageAwareCandidates } from './selection';

import type { TestCase } from '../../types/index';
import type { AttackCandidate, AttackFamily, AttackSignature } from './types';

export abstract class PortfolioRedteamPluginBase extends RedteamPluginBase {
  protected abstract readonly attackFamilies: readonly AttackFamily[];

  protected abstract getFamilyTemplate(family: AttackFamily): Promise<string>;

  protected abstract extractAttackSignature(prompt: string, family: AttackFamily): AttackSignature;

  protected getOvergenerationFactor(): number {
    return 2;
  }

  protected getMaxFamilyGenerationAttempts(): number {
    return 2;
  }

  override async generateTests(n: number, delayMs: number = 0): Promise<TestCase[]> {
    if (this.config.inputs && Object.keys(this.config.inputs).length > 0) {
      logger.debug(
        `${this.constructor.name} falling back to legacy generation because multi-input mode is enabled`,
      );
      return super.generateTests(n, delayMs);
    }

    const plan = buildBalancedAttackPlan(this.attackFamilies, n);
    const candidates: AttackCandidate[] = [];

    for (const family of plan.families) {
      const plannedCount = Math.max(1, family.count);
      const familyCandidates: AttackCandidate[] = [];
      const validFamilyCandidates: AttackCandidate[] = [];

      for (
        let attempt = 0;
        attempt < this.getMaxFamilyGenerationAttempts() &&
        validFamilyCandidates.length < plannedCount;
        attempt += 1
      ) {
        const generatedCount = Math.max(
          plannedCount,
          Math.ceil(plannedCount * this.getOvergenerationFactor()),
        );
        const prompts = await this.generatePrompts(
          generatedCount,
          delayMs,
          () => this.getFamilyTemplate(family),
        );

        const generatedCandidates = prompts.map((prompt) => ({
          prompt: prompt.__prompt,
          pluginId: getShortPluginId(this.id),
          familyId: family.id,
          familyLabel: family.label,
          signature: this.extractAttackSignature(prompt.__prompt, family),
        }));
        familyCandidates.push(...generatedCandidates);
        validFamilyCandidates.push(
          ...generatedCandidates.filter((candidate) =>
            this.matchesRequiredPredicates(candidate, family),
          ),
        );
      }

      if (family.requiredPredicates && validFamilyCandidates.length < plannedCount) {
        logger.warn(
          `${this.constructor.name} found ${validFamilyCandidates.length}/${plannedCount} valid ${family.id} candidates matching predicates: ${family.requiredPredicates.join(', ')}`,
        );
      }

      candidates.push(
        ...(family.requiredPredicates && family.requiredPredicates.length > 0
          ? validFamilyCandidates
          : familyCandidates),
      );
    }

    const selected = selectCoverageAwareCandidates(candidates, n);
    if (selected.length !== n) {
      logger.warn(
        `${this.constructor.name} selected ${selected.length}/${n} portfolio candidates after coverage-aware selection`,
      );
    }

    const prompts: GeneratedPrompt[] = selected.map((candidate) => ({
      __prompt: candidate.prompt,
      metadata: {
        attackFamily: candidate.familyId,
        attackFamilyLabel: candidate.familyLabel,
        attackSignature: candidate.signature,
        generationMode: 'portfolio',
      },
    }));

    return this.promptsToTestCases(prompts);
  }

  private matchesRequiredPredicates(candidate: AttackCandidate, family: AttackFamily): boolean {
    if (!family.requiredPredicates || family.requiredPredicates.length === 0) {
      return true;
    }

    return family.requiredPredicates.every(
      (predicate) => candidate.signature.predicates[predicate] === true,
    );
  }
}
