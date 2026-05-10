import dedent from 'dedent';
import logger from '../../logger';
import { type GeneratedPrompt, RedteamPluginBase } from '../plugins/base';
import { getShortPluginId } from '../util';
import { buildBalancedAttackPlan, selectCoverageAwareCandidates } from './selection';

import type { TestCase } from '../../types/index';
import type { AttackCandidate, AttackFamily, AttackPlan, AttackSignature } from './types';

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

  protected getMaxFamilyRepairAttempts(): number {
    return 1;
  }

  protected buildAttackPlan(requestedCount: number): AttackPlan {
    return buildBalancedAttackPlan(this.attackFamilies, requestedCount);
  }

  protected selectPortfolioCandidates(
    candidates: readonly AttackCandidate[],
    requestedCount: number,
  ): AttackCandidate[] {
    return selectCoverageAwareCandidates(candidates, requestedCount);
  }

  protected async getFamilyRepairTemplate(
    family: AttackFamily,
    rejectedCandidates: readonly AttackCandidate[],
  ): Promise<string> {
    const rejectedPrompts = rejectedCandidates
      .slice(-3)
      .map(
        (candidate) =>
          `- ${candidate.prompt}\n  Observed predicates: ${this.describeObservedPredicates(candidate)}`,
      )
      .join('\n');

    return dedent`
      ${await this.getFamilyTemplate(family)}

      Repair pass:
      The previous candidates did not visibly satisfy the "${family.label}" attack family.
      Generate replacement prompts only.
      Every replacement must explicitly satisfy these required predicates:
      - ${(family.requiredPredicates ?? []).join('\n      - ')}

      Rejected prompts to avoid repeating:
      ${rejectedPrompts || '- No prior rejected prompts were retained.'}
    `;
  }

  override async generateTests(n: number, delayMs: number = 0): Promise<TestCase[]> {
    if (this.config.inputs && Object.keys(this.config.inputs).length > 0) {
      logger.debug(
        `${this.constructor.name} falling back to legacy generation because multi-input mode is enabled`,
      );
      return super.generateTests(n, delayMs);
    }

    const plan = this.buildAttackPlan(n);
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
        const prompts = await this.generatePrompts(generatedCount, delayMs, () =>
          this.getFamilyTemplate(family),
        );

        const generatedCandidates = this.buildCandidates(prompts, family, 'initial');
        familyCandidates.push(...generatedCandidates);
        validFamilyCandidates.push(
          ...generatedCandidates.filter((candidate) =>
            this.matchesRequiredPredicates(candidate, family),
          ),
        );
      }

      for (
        let attempt = 0;
        family.requiredPredicates &&
        family.requiredPredicates.length > 0 &&
        attempt < this.getMaxFamilyRepairAttempts() &&
        validFamilyCandidates.length < plannedCount;
        attempt += 1
      ) {
        const repairCount = plannedCount - validFamilyCandidates.length;
        const generatedCount = Math.max(
          repairCount,
          Math.ceil(repairCount * this.getOvergenerationFactor()),
        );
        const prompts = await this.generatePrompts(generatedCount, delayMs, () =>
          this.getFamilyRepairTemplate(
            family,
            familyCandidates.filter(
              (candidate) => !this.matchesRequiredPredicates(candidate, family),
            ),
          ),
        );

        const generatedCandidates = this.buildCandidates(prompts, family, 'repair');
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

    const selected = this.selectPortfolioCandidates(candidates, n);
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
        generationPhase: candidate.generationPhase,
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

  private buildCandidates(
    prompts: readonly GeneratedPrompt[],
    family: AttackFamily,
    generationPhase: AttackCandidate['generationPhase'],
  ): AttackCandidate[] {
    return prompts.map((prompt) => ({
      prompt: prompt.__prompt,
      pluginId: getShortPluginId(this.id),
      familyId: family.id,
      familyLabel: family.label,
      generationPhase,
      signature: this.extractAttackSignature(prompt.__prompt, family),
    }));
  }

  private describeObservedPredicates(candidate: AttackCandidate): string {
    const activePredicates = Object.entries(candidate.signature.predicates)
      .filter(([, value]) => value)
      .map(([predicate]) => predicate)
      .sort();

    return activePredicates.length > 0 ? activePredicates.join(', ') : 'none';
  }
}
