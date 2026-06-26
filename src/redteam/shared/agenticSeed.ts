/**
 * Strategies whose outer prompt is only a seed for an attack provider. These
 * providers generate the prompt that is ultimately sent to the target, so the
 * seed may be shorter than the configured minimum. The generated target call
 * is still validated separately.
 *
 * Keep this list narrower than AGENTIC_STRATEGIES: mischievous-user sends its
 * simulated turns directly to the target and therefore must keep the target
 * wrapper.
 */
const DEFERRED_MINIMUM_AGENTIC_SEEDS = new Set([
  'crescendo',
  'goat',
  'best-of-n',
  'authoritative-markup-injection',
  'indirect-web-pwn',
  'custom',
  'jailbreak',
  'jailbreak:hydra',
  'jailbreak:meta',
  'jailbreak:tree',
]);

function normalizeAgenticSeedId(id: string): string {
  let normalized = id
    .replace(new RegExp('^layer/[^:]+:'), '')
    .replace(new RegExp('^promptfoo:redteam:'), '');
  normalized = normalized.split('/')[0];

  if (normalized === 'hydra') {
    return 'jailbreak:hydra';
  }
  if (normalized === 'iterative') {
    return 'jailbreak';
  }
  if (normalized === 'iterative:meta') {
    return 'jailbreak:meta';
  }
  if (normalized === 'iterative:tree') {
    return 'jailbreak:tree';
  }
  if (normalized.startsWith('custom:')) {
    return 'custom';
  }
  return normalized;
}

/**
 * Whether the active provider/strategy is an agentic seed whose minimum length
 * is intentionally deferred until its internally generated target calls.
 */
export function isDeferredMinimumAgenticSeed({
  providerId,
  strategyId,
}: {
  providerId?: string;
  strategyId?: string;
}): boolean {
  return [strategyId, providerId].some(
    (id) => id !== undefined && DEFERRED_MINIMUM_AGENTIC_SEEDS.has(normalizeAgenticSeedId(id)),
  );
}
