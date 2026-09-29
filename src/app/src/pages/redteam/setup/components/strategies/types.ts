import { type Strategy } from '@promptfoo/redteam/constants';
export interface StrategyCardData {
  id: Strategy;
  name: string;
  description: string;
}

export interface ConfigDialogState {
  isOpen: boolean;
  selectedStrategy: string | null;
}
