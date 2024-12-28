import { type TokenUsage } from '../../../types';

export interface RedteamResponse {
  improvement: string;
  prompt: string;
}

export interface JudgeScoreResult {
  currentScore: number;
  previousScore: number;
  explanation: string;
  tokenUsage?: TokenUsage;
}

export interface OnTopicResult {
  isOnTopic: boolean;
  tokenUsage?: TokenUsage;
}

export interface ConversationState {
  highestScore: number;
  bestResponse: string;
  finalTargetPrompt?: string;
  finalIteration: number;
  previousOutputs: Array<{
    prompt: string;
    output: string;
    score: number;
    isOnTopic: boolean;
  }>;
  redteamHistory: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}
