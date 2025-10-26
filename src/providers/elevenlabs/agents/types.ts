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

  // Advanced features (v2.0)
  llmCascade?: LLMCascadeConfig; // LLM fallback configuration
  customLLM?: CustomLLMConfig; // Custom LLM endpoint
  mcpConfig?: MCPConfig; // Model Context Protocol integration
  multiVoice?: MultiVoiceConfig; // Multi-voice conversation support
  postCallWebhook?: PostCallWebhookConfig; // Post-call notifications
  phoneConfig?: PhoneConfig; // Phone integration (Twilio/SIP)
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
 * LLM Cascading configuration
 */
export interface LLMCascadeConfig {
  primary: string; // Primary LLM (e.g., 'gpt-4o')
  fallback: string[]; // Fallback LLMs (e.g., ['gpt-4o-mini', 'gpt-3.5-turbo'])
  cascadeOnError?: boolean; // Fallback on primary errors (default: true)
  cascadeOnLatency?: {
    enabled: boolean;
    maxLatencyMs: number; // Switch to fallback if primary exceeds this
  };
  cascadeOnCost?: {
    enabled: boolean;
    maxCostPerRequest: number; // Switch to fallback if cost exceeds this
  };
}

/**
 * Custom LLM endpoint configuration
 */
export interface CustomLLMConfig {
  name: string; // Unique identifier for this LLM
  url: string; // API endpoint URL
  apiKey?: string; // API key (stored securely)
  model?: string; // Model identifier
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>; // Additional headers
}

/**
 * Model Context Protocol (MCP) integration
 */
export interface MCPConfig {
  serverUrl: string; // MCP server URL
  approvalPolicy?: 'auto' | 'manual' | 'conditional'; // Tool approval policy
  approvalConditions?: {
    requireApprovalForTools?: string[]; // Tools requiring manual approval
    requireApprovalForCost?: number; // Cost threshold for approval
  };
  timeout?: number; // Request timeout in ms
}

/**
 * Multi-voice conversation configuration
 */
export interface MultiVoiceConfig {
  characters: {
    name: string; // Character name (referenced in conversation)
    voiceId: string; // Voice ID for this character
    role?: string; // Character role/description
  }[];
  defaultVoiceId?: string; // Fallback voice if character not found
}

/**
 * Post-call webhook configuration
 */
export interface PostCallWebhookConfig {
  url: string; // Webhook endpoint URL
  method?: 'POST' | 'PUT'; // HTTP method (default: POST)
  headers?: Record<string, string>; // Custom headers
  includeTranscript?: boolean; // Include full transcript (default: true)
  includeRecording?: boolean; // Include audio recording URL (default: false)
  includeAnalysis?: boolean; // Include conversation analysis (default: true)
}

/**
 * Phone integration configuration
 */
export interface PhoneConfig {
  provider: 'twilio' | 'sip'; // Phone provider

  // Twilio-specific
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;

  // SIP-specific
  sipUri?: string;
  sipUsername?: string;
  sipPassword?: string;

  // Common
  recordCalls?: boolean; // Record phone calls (default: false)
  transcribeCalls?: boolean; // Real-time transcription (default: true)
  batchCalling?: {
    enabled: boolean;
    phoneNumbers: string[];
    concurrent?: number; // Max concurrent calls (default: 5)
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
  };
}
