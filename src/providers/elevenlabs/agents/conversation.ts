/**
 * Conversation parsing and simulation request building for ElevenLabs Agents
 */

import logger from '../../../logger';
import type {
  ParsedConversation,
  SimulatedUser,
  EvaluationCriterion,
  ToolMockConfig,
} from './types';
import type { CallApiContextParams } from '../../../types/providers';

/**
 * Parse conversation from prompt text
 *
 * Supports multiple formats:
 * 1. Multi-line with role prefixes: "User: ...\nAgent: ..."
 * 2. Structured JSON: {turns: [{speaker, message}]}
 * 3. Plain text (treated as first user message)
 */
export function parseConversation(
  prompt: string,
  _context?: CallApiContextParams,
): ParsedConversation {
  logger.debug('[ElevenLabs Agents] Parsing conversation', {
    promptLength: prompt.length,
  });

  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(prompt);
    if (parsed.turns && Array.isArray(parsed.turns)) {
      return {
        turns: parsed.turns,
        metadata: parsed.metadata,
      };
    }
  } catch {
    // Not JSON, continue to other formats
  }

  // Try parsing multi-line with role prefixes
  const rolePattern = /^(User|Agent|System):\s*(.+)$/gim;
  const matches = [...prompt.matchAll(rolePattern)];

  if (matches.length > 0) {
    const turns = matches.map((match) => ({
      speaker: match[1].toLowerCase() === 'agent' ? ('agent' as const) : ('user' as const),
      message: match[2].trim(),
    }));

    return { turns };
  }

  // Treat as single user message
  return {
    turns: [
      {
        speaker: 'user',
        message: prompt.trim(),
      },
    ],
  };
}

/**
 * Build simulation request for ElevenLabs Agents API
 */
export function buildSimulationRequest(
  conversation: ParsedConversation,
  simulatedUser?: SimulatedUser,
  evaluationCriteria?: EvaluationCriterion[],
  toolMocks?: ToolMockConfig,
): Record<string, any> {
  logger.debug('[ElevenLabs Agents] Building simulation request', {
    turnCount: conversation.turns.length,
    hasSimulatedUser: !!simulatedUser,
    criteriaCount: evaluationCriteria?.length || 0,
  });

  const request: Record<string, any> = {
    // Conversation history
    history: conversation.turns.map((turn) => ({
      role: turn.speaker,
      content: turn.message,
    })),
  };

  // Add simulated user configuration
  if (simulatedUser) {
    request.simulated_user = {
      prompt: simulatedUser.prompt || 'Act as a helpful, curious user asking questions.',
      temperature: simulatedUser.temperature ?? 0.7,
      response_style: simulatedUser.responseStyle || 'casual',
    };
  }

  // Add evaluation criteria
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    request.evaluation_criteria = evaluationCriteria.map((criterion) => ({
      name: criterion.name,
      description: criterion.description,
      weight: criterion.weight ?? 1.0,
      passing_threshold: criterion.passingThreshold ?? 0.7,
    }));
  }

  // Add tool mocks
  if (toolMocks && Object.keys(toolMocks).length > 0) {
    request.tool_mocks = Object.entries(toolMocks).map(([toolName, mockConfig]) => ({
      tool_name: toolName,
      return_value: mockConfig.returnValue,
      error: mockConfig.error,
      latency_ms: mockConfig.latencyMs,
    }));
  }

  // Add metadata if present
  if (conversation.metadata) {
    request.metadata = conversation.metadata;
  }

  return request;
}

/**
 * Format conversation history for display
 */
export function formatConversationHistory(turns: Array<{ speaker: string; message: string }>): string {
  return turns
    .map((turn) => {
      const role = turn.speaker.charAt(0).toUpperCase() + turn.speaker.slice(1);
      return `${role}: ${turn.message}`;
    })
    .join('\n\n');
}

/**
 * Extract conversation context from vars
 */
export function extractConversationContext(context?: CallApiContextParams): Record<string, any> {
  if (!context?.vars) {
    return {};
  }

  const extracted: Record<string, any> = {};

  // Extract common context fields
  if (context.vars.topic) {
    extracted.topic = context.vars.topic;
  }

  if (context.vars.userProfile) {
    extracted.userProfile = context.vars.userProfile;
  }

  if (context.vars.previousConversation) {
    extracted.previousConversation = context.vars.previousConversation;
  }

  if (context.vars.metadata) {
    extracted.metadata = context.vars.metadata;
  }

  return extracted;
}
