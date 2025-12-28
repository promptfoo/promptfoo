/**
 * ElevenLabs Conversation History Types
 */

import type { ConversationTurn } from '../agents/types';
import type { ElevenLabsBaseConfig } from '../types';

/**
 * Configuration for conversation history provider
 */
export interface ConversationHistoryConfig extends ElevenLabsBaseConfig {
  agentId?: string; // Optional: agent ID to list conversations for
  label?: string; // Provider label
}

/**
 * Response from conversation history API
 */
export interface ConversationHistoryResponse {
  conversation_id: string;
  agent_id: string;
  status: 'completed' | 'failed' | 'timeout' | 'in_progress';
  created_at: string; // ISO 8601 timestamp
  updated_at?: string; // ISO 8601 timestamp
  duration_seconds?: number;
  history?: ConversationTurn[];
  metadata?: {
    user_id?: string;
    session_id?: string;
    [key: string]: any;
  };
  analysis?: {
    call_successful: boolean;
    transcript_summary?: string;
    evaluation_criteria_results?: Array<{
      criterion: string;
      score: number;
      passed: boolean;
    }>;
    sentiment?: {
      overall: 'positive' | 'neutral' | 'negative';
    };
  };
}

/**
 * Query parameters for listing conversations
 */
export interface ListConversationsParams {
  agent_id?: string; // Filter by agent ID
  status?: 'completed' | 'failed' | 'timeout' | 'in_progress'; // Filter by status
  start_date?: string; // ISO 8601 date - conversations after this date
  end_date?: string; // ISO 8601 date - conversations before this date
  limit?: number; // Maximum conversations to return (default: 100)
  offset?: number; // Pagination offset
}
