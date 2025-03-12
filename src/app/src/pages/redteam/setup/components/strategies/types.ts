export interface StrategiesProps {
  onNext: () => void;
  onBack: () => void;
}

export interface StrategyCardData {
  id: string;
  name: string;
  description: string;
}

export interface ConfigDialogState {
  isOpen: boolean;
  selectedStrategy: string | null;
}

export const PRESET_IDS = {
  QUICK: 'quick',
  MEDIUM: 'medium',
  LARGE: 'large',
} as const;

export type PresetId = (typeof PRESET_IDS)[keyof typeof PRESET_IDS];

export interface StrategyPreset {
  name: string;
  description: string;
  strategies: readonly string[];
  options?: {
    multiTurn?: {
      label: string;
      strategies: readonly string[];
    };
  };
}

export const STRATEGY_PRESETS: Record<PresetId, StrategyPreset> = {
  [PRESET_IDS.QUICK]: {
    name: 'Quick',
    description: 'Use to verify that your configuration is correct.',
    strategies: ['basic'] as const,
  },
  [PRESET_IDS.MEDIUM]: {
    name: 'Medium',
    description: 'Recommended strategies for moderate coverage',
    strategies: ['basic', 'jailbreak', 'jailbreak:composite', 'jailbreak:likert'] as const,
    options: {
      multiTurn: {
        label: 'My target application is conversational (multi-turn)',
        strategies: ['goat'],
      },
    },
  },
  [PRESET_IDS.LARGE]: {
    name: 'Large',
    description: 'A larger set of strategies for a more comprehensive redteam.',
    strategies: [
      'basic',
      'jailbreak:composite',
      'jailbreak:likert',
      'jailbreak:tree',
      'rot13',
      'citation',
    ] as const,
    options: {
      multiTurn: {
        label: 'My target supports multi-turn',
        strategies: ['goat', 'crescendo'],
      },
    },
  },
} as const;
