/**
 * Strategy catalog for the redteam init wizard.
 *
 * Strategies are attack methods that transform test cases into adversarial variants.
 * The actual strategy implementations are in src/redteam/strategies/
 */

import { displayNameOverrides, subCategoryDescriptions } from '../../../redteam/constants/metadata';
import {
  DEFAULT_STRATEGIES,
  MULTI_MODAL_STRATEGIES,
  MULTI_TURN_STRATEGIES,
} from '../../../redteam/constants/strategies';

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  defaultSelected: boolean;
  isMultiTurn?: boolean;
  isMultiModal?: boolean;
  requiresConfig?: boolean;
}

export interface StrategyCategory {
  id: string;
  name: string;
  description: string;
  strategies: StrategyDefinition[];
}

/**
 * Get the display name for a strategy.
 */
function getDisplayName(strategyId: string): string {
  if (displayNameOverrides[strategyId as keyof typeof displayNameOverrides]) {
    return displayNameOverrides[strategyId as keyof typeof displayNameOverrides];
  }
  // Convert kebab-case to Title Case
  return strategyId
    .split(':')
    .map((part) =>
      part
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    )
    .join(': ');
}

/**
 * Get the description for a strategy.
 */
function getDescription(strategyId: string): string {
  return (
    subCategoryDescriptions[strategyId as keyof typeof subCategoryDescriptions] ||
    'No description available'
  );
}

/**
 * Create a strategy definition from a strategy ID.
 */
function createStrategyDef(strategyId: string): StrategyDefinition {
  const isMultiTurn = (MULTI_TURN_STRATEGIES as readonly string[]).includes(strategyId);
  const isMultiModal = (MULTI_MODAL_STRATEGIES as readonly string[]).includes(strategyId);

  return {
    id: strategyId,
    name: getDisplayName(strategyId),
    description: getDescription(strategyId),
    defaultSelected: (DEFAULT_STRATEGIES as readonly string[]).includes(strategyId),
    isMultiTurn,
    isMultiModal,
    requiresConfig: ['custom', 'layer'].includes(strategyId),
  };
}

/**
 * Strategy catalog organized by category.
 */
export const STRATEGY_CATALOG: StrategyCategory[] = [
  {
    id: 'default',
    name: 'Default Strategies',
    description: 'Recommended strategies for most red team evaluations',
    strategies: DEFAULT_STRATEGIES.map(createStrategyDef),
  },
  {
    id: 'jailbreak',
    name: 'Jailbreak Techniques',
    description: 'Advanced techniques to bypass safety guardrails',
    strategies: ['jailbreak', 'jailbreak:tree', 'jailbreak:likert', 'jailbreak:hydra'].map(
      createStrategyDef,
    ),
  },
  {
    id: 'multi-turn',
    name: 'Multi-Turn Attacks',
    description: 'Conversational attack strategies that escalate over multiple turns',
    strategies: MULTI_TURN_STRATEGIES.filter((s) => !s.startsWith('jailbreak')).map(
      createStrategyDef,
    ),
  },
  {
    id: 'encoding',
    name: 'Encoding & Obfuscation',
    description: 'Techniques to encode or obfuscate malicious content',
    strategies: [
      'base64',
      'hex',
      'rot13',
      'leetspeak',
      'homoglyph',
      'morse',
      'piglatin',
      'camelcase',
      'emoji',
    ].map(createStrategyDef),
  },
  {
    id: 'injection',
    name: 'Injection Techniques',
    description: 'Prompt injection and manipulation strategies',
    strategies: ['prompt-injection', 'authoritative-markup-injection', 'citation'].map(
      createStrategyDef,
    ),
  },
  {
    id: 'multimodal',
    name: 'Multi-Modal',
    description: 'Strategies targeting multi-modal models',
    strategies: MULTI_MODAL_STRATEGIES.map(createStrategyDef),
  },
  {
    id: 'advanced',
    name: 'Advanced',
    description: 'Advanced attack strategies requiring more configuration',
    strategies: ['gcg', 'best-of-n', 'layer', 'retry', 'math-prompt'].map(createStrategyDef),
  },
];

/**
 * Get a flat list of all strategies.
 */
export function getAllStrategies(): StrategyDefinition[] {
  return STRATEGY_CATALOG.flatMap((category) => category.strategies);
}

/**
 * Get strategies by category ID.
 */
export function getStrategiesByCategory(categoryId: string): StrategyDefinition[] {
  const category = STRATEGY_CATALOG.find((c) => c.id === categoryId);
  return category?.strategies || [];
}

/**
 * Get default strategies (pre-selected for new configs).
 */
export function getDefaultStrategies(): string[] {
  return Array.from(DEFAULT_STRATEGIES);
}

/**
 * Get strategy definition by ID.
 */
export function getStrategy(strategyId: string): StrategyDefinition | undefined {
  for (const category of STRATEGY_CATALOG) {
    const strategy = category.strategies.find((s) => s.id === strategyId);
    if (strategy) {
      return strategy;
    }
  }
  return undefined;
}
