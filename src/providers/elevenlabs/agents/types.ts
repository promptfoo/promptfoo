/**
 * ElevenLabs Conversational Agents Types
 *
 * Defines types for testing and evaluating voice AI agents
 */

import type { ElevenLabsBaseConfig } from '../types';

/**
 * ElevenLabs Agents provider configuration
 */
export interface ElevenLabsAgentsConfig extends ElevenLabsBaseConfig {
  // Agent identification
  agentId?: string; // Use existing agent ID, or create ephemeral agent
  agentConfig?: AgentConfig; // Configuration for ephemeral agent creation

  // Simulation parameters
  simulatedUser?: SimulatedUser;
  evaluationCriteria?: EvaluationCriterion[];
  toolMockConfig?: ToolMockConfig;
  maxTurns?: number; // Maximum conversation turns (default: 10)
  label?: string; // Provider label
}

/**
 * Agent configuration for creating ephemeral agents
 */
export interface AgentConfig {
  name?: string;
  prompt?: string; // System prompt for the agent
  firstMessage?: string; // Agent's opening message
  language?: string; // ISO 639-1 language code
  voiceId?: string; // Voice to use for agent
  llmModel?: string; // LLM model (gpt-4, claude-3-opus, etc.)
  temperature?: number; // LLM temperature (0-1)
  maxTokens?: number; // Max tokens per LLM response
  tools?: AgentTool[]; // Available tools for agent
  knowledgeBase?: string[]; // Knowledge base document IDs
}

/**
 * Agent tool definition
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler?: string; // URL endpoint or function reference
}

/**
 * Simulated user configuration
 */
export interface SimulatedUser {
  prompt?: string; // Instructions for simulated user behavior
  temperature?: number; // User model temperature
  responseStyle?: 'concise' | 'verbose' | 'casual' | 'formal';
  language?: string; // Language for simulated user (ISO 639-1 code)
}

/**
 * Evaluation criterion for agent performance
 */
export interface EvaluationCriterion {
  id?: string; // Unique criterion ID
  name: string;
  description: string;
  weight?: number; // Relative importance (0-1) - deprecated, use for compatibility
  passingThreshold?: number; // Minimum score to pass (0-1) - deprecated, use for compatibility
  useKnowledgeBase?: boolean; // Whether to use knowledge base for evaluation
}

/**
 * Tool mock configuration for testing
 */
export interface ToolMockConfig {
  [toolName: string]: {
    returnValue?: any;
    error?: string;
    latencyMs?: number;
  };
}

/**
 * Agent simulation response
 */
export interface AgentSimulationResponse {
  conversation_id?: string;
  status?: 'completed' | 'failed' | 'timeout';
  simulated_conversation?: ConversationTurn[]; // API uses simulated_conversation, not history
  history?: ConversationTurn[]; // Keep for backward compatibility
  analysis?: ConversationAnalysis;
  llm_usage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    model: string;
  };
  error?: string;
}

/**
 * Single conversation turn
 */
export interface ConversationTurn {
  role: 'agent' | 'user' | 'system';
  content: string;
  timestamp?: number;
  metadata?: {
    audioUrl?: string;
    duration_ms?: number;
    toolCalls?: ToolCall[];
    emotion?: string;
  };
}

/**
 * Tool call in conversation
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
  latency_ms?: number;
}

/**
 * Conversation analysis
 */
export interface ConversationAnalysis {
  call_successful: boolean;
  transcript_summary?: string;
  evaluation_criteria_results?: EvaluationResult[];
  sentiment?: {
    overall: 'positive' | 'neutral' | 'negative';
    by_turn?: Array<{
      turn: number;
      sentiment: string;
      confidence: number;
    }>;
  };
  topics?: string[];
  actionItems?: string[];
}

/**
 * Evaluation result for a criterion
 */
export interface EvaluationResult {
  criterion: string;
  score: number; // 0-1
  passed: boolean;
  feedback?: string;
  evidence?: string[]; // Quotes from conversation
}

/**
 * Conversation history parsing
 */
export interface ParsedConversation {
  turns: Array<{
    speaker: 'agent' | 'user';
    message: string;
  }>;
  metadata?: {
    topic?: string;
    context?: string;
    dynamic_variables?: Record<string, any>;
  };
}
