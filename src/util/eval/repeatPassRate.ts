import type { calculateRepeatStability } from './repeatStability';

// Derived from the calculator to avoid a dependency on legacy contract types.
type RepeatStabilitySummary = ReturnType<typeof calculateRepeatStability>;
type RepeatStabilityGroup = NonNullable<RepeatStabilitySummary>['groups'][number];

/**
 * Repeat groups (test, expanded vars, prompt and provider) whose share of passing runs is
 * below `threshold` percent. Errored runs count as not passing.
 */
export function getFailingRepeatGroups(
  summary: RepeatStabilitySummary | undefined,
  threshold: number,
): RepeatStabilityGroup[] {
  if (!summary) {
    return [];
  }
  return summary.groups.filter(
    (group) => group.repetitions > 0 && (group.passed / group.repetitions) * 100 < threshold,
  );
}
