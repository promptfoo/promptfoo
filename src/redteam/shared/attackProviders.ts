/**
 * Registry of agentic attack providers that support per-turn/per-iteration layer transforms.
 *
 * These are strategies internally implemented as providers that orchestrate
 * adversarial attacks over multiple iterations or turns.
 *
 * Two categories:
 *
 * 1. **Multi-turn conversation** (hydra, crescendo, goat, custom):
 *    - Target sees all previous messages (conversation context)
 *    - Uses hybrid format: text history + audio/image current turn
 *
 * 2. **Multi-attempt single-turn** (meta, tree):
 *    - Each iteration is independent (target sees one message per attempt)
 *    - Transforms each single message directly (no hybrid format needed)
 *
 * Note: This is a subset of MULTI_TURN_STRATEGIES + AGENTIC_STRATEGIES.
 * Not all strategies support per-turn transforms:
 * - simba: Different architecture, not yet supported
 * - mischievous-user: Different implementation pattern
 */

import { MULTI_TURN_STRATEGIES } from '../constants/strategies';

/**
 * Attack providers that support per-turn/per-iteration layer transforms.
 *
 * These providers:
 * 1. Accept `_perTurnLayers` config to apply transforms per turn/iteration
 * 2. Multi-turn: Send hybrid payloads (text history + audio/image current turn)
 * 3. Single-turn iterative: Send transformed single message
 * 4. Store promptAudio/promptImage in redteamHistory for UI rendering
 */
export const ATTACK_PROVIDER_IDS = [
  // Multi-turn conversation (hybrid format with history)
  'hydra', // jailbreak:hydra
  'crescendo',
  'goat',
  'custom',
  // Multi-attempt single-turn (direct transform, no history)
  'iterative', // jailbreak (base)
  'iterative:meta', // jailbreak:meta
  'iterative:tree', // jailbreak:tree
] as const;

export type AttackProviderId = (typeof ATTACK_PROVIDER_IDS)[number];

/**
 * Check if a strategy ID corresponds to an attack provider
 * that supports per-turn/per-iteration layer transforms.
 *
 * Handles various ID formats:
 * - Short: 'hydra', 'crescendo', 'goat', 'custom', 'meta', 'tree'
 * - Full: 'promptfoo:redteam:hydra', 'promptfoo:redteam:iterative:meta'
 * - Prefixed: 'jailbreak:hydra', 'jailbreak:meta', 'jailbreak:tree'
 *
 * @param id - The strategy ID to check
 * @returns true if this is an attack provider supporting per-turn transforms
 */
export function isAttackProvider(id: string): boolean {
  // Normalize the ID by removing common prefixes
  let baseId = id.replace('promptfoo:redteam:', '');

  // Handle jailbreak and jailbreak: prefix for iterative strategies
  if (baseId === 'jailbreak') {
    baseId = 'iterative';
  } else if (baseId.startsWith('jailbreak:')) {
    const jailbreakType = baseId.replace('jailbreak:', '');
    // jailbreak:hydra -> hydra
    // jailbreak:meta -> iterative:meta
    // jailbreak:tree -> iterative:tree
    if (jailbreakType === 'meta') {
      baseId = 'iterative:meta';
    } else if (jailbreakType === 'tree') {
      baseId = 'iterative:tree';
    } else {
      baseId = jailbreakType;
    }
  }

  // Handle 'custom:...' variants
  if (baseId.startsWith('custom:') || baseId === 'custom') {
    baseId = 'custom';
  }

  return ATTACK_PROVIDER_IDS.includes(baseId as AttackProviderId);
}

/**
 * Get the full provider ID for an attack provider.
 *
 * @param id - The strategy ID (e.g., 'hydra', 'jailbreak', 'jailbreak:hydra', 'jailbreak:meta')
 * @returns The full provider ID (e.g., 'promptfoo:redteam:hydra', 'promptfoo:redteam:iterative')
 */
export function getAttackProviderFullId(id: string): string {
  if (id.startsWith('promptfoo:redteam:')) {
    return id;
  }

  // Handle jailbreak (base) -> promptfoo:redteam:iterative
  if (id === 'jailbreak') {
    return 'promptfoo:redteam:iterative';
  }

  // Handle jailbreak: prefix
  if (id.startsWith('jailbreak:')) {
    const jailbreakType = id.replace('jailbreak:', '');
    // jailbreak:meta -> promptfoo:redteam:iterative:meta
    // jailbreak:tree -> promptfoo:redteam:iterative:tree
    // jailbreak:hydra -> promptfoo:redteam:hydra
    if (jailbreakType === 'meta') {
      return 'promptfoo:redteam:iterative:meta';
    } else if (jailbreakType === 'tree') {
      return 'promptfoo:redteam:iterative:tree';
    }
    return `promptfoo:redteam:${jailbreakType}`;
  }

  // Handle custom:foo -> promptfoo:redteam:custom
  if (id.startsWith('custom:') || id === 'custom') {
    return 'promptfoo:redteam:custom';
  }

  return `promptfoo:redteam:${id}`;
}

/**
 * Check if a strategy is a multi-turn strategy (broader than attack providers).
 * This includes all strategies from MULTI_TURN_STRATEGIES constant.
 *
 * Note: Not all multi-turn strategies support per-turn layer transforms.
 * Use isAttackProvider() to check for that capability.
 */
export function isMultiTurnStrategy(id: string): boolean {
  const normalizedId = id.replace('promptfoo:redteam:', '').replace('jailbreak:', '');

  return MULTI_TURN_STRATEGIES.some((strategy) => {
    const normalizedStrategy = strategy.replace('jailbreak:', '');
    return normalizedId === normalizedStrategy;
  });
}
