import dedent from 'dedent';
import logger from '../../logger';
import { type GeneratedPrompt, RedteamPluginBase } from '../plugins/base';
import { getShortPluginId } from '../util';
import {
  buildBalancedAttackPlan,
  normalizePrompt,
  type SemanticBandSelectionConfig,
  selectCoverageAwareCandidates,
  selectSemanticBandAwareCandidates,
  selectSemanticWarmStartFamilies,
} from './selection';

import type { SemanticFrontierSummary } from '../../types/semanticFrontierDiagnostics';
import type { AttackCandidate, AttackFamily, AttackPlan, AttackSignature } from './types';

export type SemanticFrontierConfig = SemanticBandSelectionConfig & {
  minimumPortfolioSize: number;
};

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

  protected getSemanticFrontierConfig(): SemanticFrontierConfig | undefined {
    return undefined;
  }

  protected useSemanticFrontierBelowMinimumSize(): boolean {
    return false;
  }

  protected getSemanticFrontierPlanningCount(requestedCount: number): number {
    return Math.max(requestedCount, this.attackFamilies.length);
  }

  protected getSemanticFrontierWarmStartFamilyCount(_requestedCount: number): number | undefined {
    return undefined;
  }

  protected getPortfolioGenerationFallbackReason(): string | undefined {
    if (this.config.examples?.length) {
      return 'custom examples may specify attacks outside the built-in semantic families';
    }

    const language = this.config.language ?? this.config.modifiers?.language;
    const languages = Array.isArray(language) ? language : language ? [language] : [];
    const nonEnglishLanguage = languages.find((language) => {
      const normalizedLanguage = language.trim().toLowerCase();
      return (
        normalizedLanguage !== 'en' &&
        normalizedLanguage !== 'english' &&
        !/^en[-_]/.test(normalizedLanguage)
      );
    });

    if (nonEnglishLanguage) {
      return `localized generation (${nonEnglishLanguage}) is not compatible with English-only semantic predicates`;
    }

    return undefined;
  }

  protected buildAttackPlan(requestedCount: number): AttackPlan {
    const semanticFrontier = this.getSemanticFrontierConfig();
    const shouldUseSemanticFrontier =
      semanticFrontier &&
      (requestedCount >= semanticFrontier.minimumPortfolioSize ||
        this.useSemanticFrontierBelowMinimumSize());
    const warmStartFamilyCount =
      shouldUseSemanticFrontier && requestedCount < semanticFrontier.minimumPortfolioSize
        ? this.getSemanticFrontierWarmStartFamilyCount(requestedCount)
        : undefined;
    if (shouldUseSemanticFrontier && warmStartFamilyCount) {
      const plannedCount = Math.max(requestedCount, warmStartFamilyCount);
      return buildBalancedAttackPlan(
        selectSemanticWarmStartFamilies(this.attackFamilies, plannedCount, semanticFrontier),
        plannedCount,
      );
    }
    const plannedCount = shouldUseSemanticFrontier
      ? this.getSemanticFrontierPlanningCount(requestedCount)
      : requestedCount;

    return buildBalancedAttackPlan(this.attackFamilies, plannedCount);
  }

  protected selectPortfolioCandidates(
    candidates: readonly AttackCandidate[],
    requestedCount: number,
  ): AttackCandidate[] {
    const semanticFrontier = this.getSemanticFrontierConfig();
    if (
      semanticFrontier &&
      (requestedCount >= semanticFrontier.minimumPortfolioSize ||
        this.useSemanticFrontierBelowMinimumSize())
    ) {
      return selectSemanticBandAwareCandidates(candidates, requestedCount, semanticFrontier);
    }

    return selectCoverageAwareCandidates(candidates, requestedCount);
  }

  protected async getFamilyRepairTemplate(
    family: AttackFamily,
    rejectedCandidates: readonly AttackCandidate[],
  ): Promise<string> {
    // Render braces literally so rejected prompts cannot introduce template expressions.
    const rejectedPrompts = rejectedCandidates
      .slice(-3)
      .map(
        (candidate) =>
          `- ${candidate.prompt.replace(/\{/g, '{{ "{" }}')}\n  Observed predicates: ${this.describeObservedPredicates(candidate)}`,
      )
      .join('\n');

    return dedent`
      ${await this.getFamilyTemplate(family)}

      Repair pass:
      The previous candidates did not visibly satisfy the "${family.label}" attack family or repeated an already accepted prompt.
      Generate replacement prompts only.
      Every replacement must explicitly satisfy these required predicates:
      - ${(family.requiredPredicates ?? []).join('\n      - ')}

      Rejected prompts to avoid repeating:
      ${rejectedPrompts || '- No prior rejected prompts were retained.'}
    `;
  }

  override async generateTests(n: number, delayMs: number = 0) {
    if (this.config.inputs && Object.keys(this.config.inputs).length > 0) {
      logger.debug(
        `${this.constructor.name} falling back to legacy generation because multi-input mode is enabled`,
      );
      return super.generateTests(n, delayMs);
    }

    const fallbackReason = this.getPortfolioGenerationFallbackReason();
    if (fallbackReason) {
      logger.debug(
        `${this.constructor.name} falling back to legacy generation because ${fallbackReason}`,
      );
      return super.generateTests(n, delayMs);
    }

    const plan = this.buildAttackPlan(n);
    const candidates: AttackCandidate[] = [];
    const validPromptKeys = new Set<string>();
    const overgenerationFactor = n > 1 ? this.getOvergenerationFactor() : 1;

    for (const family of plan.families) {
      const plannedCount = Math.max(1, family.count);
      const familyCandidates: AttackCandidate[] = [];
      const validFamilyCandidates: AttackCandidate[] = [];
      const appendValidFamilyCandidates = (generatedCandidates: readonly AttackCandidate[]) => {
        for (const candidate of generatedCandidates) {
          const promptKey = normalizePrompt(candidate.prompt);
          if (
            this.matchesRequiredPredicates(candidate, family) &&
            !validPromptKeys.has(promptKey)
          ) {
            validPromptKeys.add(promptKey);
            validFamilyCandidates.push(candidate);
          }
        }
      };

      for (
        let attempt = 0;
        attempt < this.getMaxFamilyGenerationAttempts() &&
        validFamilyCandidates.length < plannedCount;
        attempt += 1
      ) {
        const generatedCount = Math.max(
          plannedCount,
          Math.ceil(plannedCount * overgenerationFactor),
        );
        const prompts = await this.generatePrompts(generatedCount, delayMs, () =>
          this.getFamilyTemplate(family),
        );

        const generatedCandidates = this.buildCandidates(prompts, family, 'initial');
        familyCandidates.push(...generatedCandidates);
        appendValidFamilyCandidates(generatedCandidates);
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
        const generatedCount = Math.max(repairCount, Math.ceil(repairCount * overgenerationFactor));
        const prompts = await this.generatePrompts(generatedCount, delayMs, () =>
          this.getFamilyRepairTemplate(
            family,
            familyCandidates.filter((candidate) => !validFamilyCandidates.includes(candidate)),
          ),
        );

        const generatedCandidates = this.buildCandidates(prompts, family, 'repair');
        familyCandidates.push(...generatedCandidates);
        appendValidFamilyCandidates(generatedCandidates);
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

    const semanticFrontier = this.getSemanticFrontierConfig();
    const isSemanticFrontierActive =
      semanticFrontier !== undefined &&
      (n >= semanticFrontier.minimumPortfolioSize || this.useSemanticFrontierBelowMinimumSize());
    const semanticFrontierSummary =
      semanticFrontier && isSemanticFrontierActive
        ? this.summarizeSemanticFrontier(selected, semanticFrontier, n)
        : undefined;
    const prompts: GeneratedPrompt[] = selected.map((candidate) => ({
      __prompt: candidate.prompt,
      metadata: {
        attackFamily: candidate.familyId,
        attackFamilyLabel: candidate.familyLabel,
        attackSignature: candidate.signature,
        generationPhase: candidate.generationPhase,
        generationMode: 'portfolio',
        ...(semanticFrontierSummary && { semanticFrontier: semanticFrontierSummary }),
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

  private summarizeSemanticFrontier(
    selected: readonly AttackCandidate[],
    config: SemanticFrontierConfig,
    requestedCount: number,
  ): SemanticFrontierSummary {
    const observedPredicates = new Set(
      selected.flatMap((candidate) =>
        Object.entries(candidate.signature.predicates)
          .filter(([, enabled]) => enabled)
          .map(([predicate]) => predicate),
      ),
    );
    const hasUndeclaredFamilies = this.attackFamilies.some(
      (family) => !family.requiredPredicates || family.requiredPredicates.length === 0,
    );
    const reachablePredicates = hasUndeclaredFamilies
      ? new Set(Object.values(config.bands).flat())
      : new Set(this.attackFamilies.flatMap((family) => family.requiredPredicates ?? []));
    const bands = Object.fromEntries(
      Object.entries(config.bands).map(([bandId, features]) => {
        const observedFeatureIds = features.filter((feature) => observedPredicates.has(feature));
        const reachableFeatureIds = features.filter((feature) => reachablePredicates.has(feature));
        const unreachableFeatureIds = features.filter(
          (feature) => !reachablePredicates.has(feature),
        );
        return [
          bandId,
          {
            featureCount: features.length,
            observedFeatureCount: observedFeatureIds.length,
            observedFeatureIds,
            reachableFeatureCount: reachableFeatureIds.length,
            reachableFeatureIds,
            unreachableFeatureIds,
          },
        ];
      }),
    );

    return {
      active:
        requestedCount >= config.minimumPortfolioSize || this.useSemanticFrontierBelowMinimumSize(),
      bands,
      complete: Object.values(bands).every(
        (summary) => summary.observedFeatureCount === summary.featureCount,
      ),
      minimumPortfolioSize: config.minimumPortfolioSize,
    };
  }
}
