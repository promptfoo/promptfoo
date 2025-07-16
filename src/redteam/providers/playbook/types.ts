import type {
  ProviderResponse,
  RedteamFileConfig,
} from '../../../types';
import type { BaseRedteamMetadata } from '../../types';

/**
 * Represents metadata for the Playbook conversation process.
 */
export interface PlaybookMetadata extends BaseRedteamMetadata {
  playbookRoundsCompleted: number;
  playbookBacktrackCount: number;
  playbookResult: boolean;
  playbookConfidence: number | null;
  stopReason:
    | 'Grader failed'
    | 'Internal evaluator success'
    | 'Max rounds reached'
    | 'Max backtracks reached';
  successfulAttacks?: Array<{
    turn: number;
    prompt: string;
    response: string;
  }>;
  totalSuccessfulAttacks?: number;
}

/**
 * Represents the complete response from a Playbook conversation.
 */
export interface PlaybookResponse extends ProviderResponse {
  metadata: PlaybookMetadata;
}

export interface PlaybookConfig {
  injectVar: string;
  strategyText: string;
  maxTurns?: number;
  maxBacktracks?: number;
  redteamProvider: RedteamFileConfig['provider'];
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
  stateful?: boolean;
  continueAfterSuccess?: boolean;
} 