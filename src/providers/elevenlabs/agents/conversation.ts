/**
 * Conversation parsing and simulation request building for ElevenLabs Agents
 */

import logger from '../../../logger';

import type { CallApiContextParams } from '../../../types/providers';
import type {
  EvaluationCriterion,
  ParsedConversation,
  SimulatedUser,
  ToolMockConfig,
} from './types';

/**
 * Normalize speaker role to API-compatible format
 * API expects: 'user' | 'agent' (lowercase)
 * Supports: User, user, Customer, customer, Agent, agent, System, etc.
 */
function normalizeSpeakerRole(speaker: string): 'user' | 'agent' {
  const normalized = speaker.toLowerCase();
  // 'agent' maps to 'agent', everything else (user, customer, system) maps to 'user'
  return normalized === 'agent' ? 'agent' : 'user';
}

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
      // Normalize speaker roles to lowercase 'user' or 'agent'
      const normalizedTurns = parsed.turns.map((turn: any) => ({
        ...turn,
        speaker: normalizeSpeakerRole(turn.speaker),
      }));
      return {
        turns: normalizedTurns,
        metadata: parsed.metadata,
      };
    }
  } catch {
    // Not JSON, continue to other formats
  }

  // Try parsing multi-line with role prefixes
  const rolePattern = /^(User|Agent|System|Customer):\s*(.+)$/gim;
  const matches = [...prompt.matchAll(rolePattern)];

  if (matches.length > 0) {
    const turns = matches.map((match) => ({
      speaker: normalizeSpeakerRole(match[1]),
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
 *
 * API Format (v1/convai/agents/{id}/simulate-conversation):
 * {
 *   simulation_specification: {
 *     simulated_user_config: { first_message, prompt, ... },
 *     tool_mock_config: { [tool_name]: { default_return_value, default_is_error } },
 *     partial_conversation_history: [...],
 *     dynamic_variables: {...}
 *   },
 *   extra_evaluation_criteria: [...],
 *   new_turns_limit: number
 * }
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

  // Build simulated_user_config (required by API)
  const simulatedUserConfig: Record<string, any> = {
    first_message: conversation.turns[0]?.message || 'Hello',
  };

  // Add simulated user prompt configuration
  if (simulatedUser) {
    simulatedUserConfig.prompt = {
      prompt: simulatedUser.prompt || 'Act as a helpful, curious user asking questions.',
      temperature: simulatedUser.temperature ?? 0.7,
      // Optional: llm, max_tokens, tool_ids, etc.
    };

    // Add language if specified
    if (simulatedUser.language) {
      simulatedUserConfig.language = simulatedUser.language;
    }
  }

  // Build simulation_specification (required wrapper)
  const simulationSpecification: Record<string, any> = {
    simulated_user_config: simulatedUserConfig,
  };

  // Add partial conversation history (skip first turn as it's used in first_message)
  if (conversation.turns.length > 1) {
    simulationSpecification.partial_conversation_history = conversation.turns
      .slice(1)
      .map((turn, index) => ({
        role: turn.speaker,
        message: turn.message,
        time_in_call_secs: (index + 1) * 5, // Estimate 5 seconds per turn
      }));
  }

  // Add tool mocks
  if (toolMocks && Object.keys(toolMocks).length > 0) {
    const toolMockConfig: Record<string, any> = {};

    for (const [toolName, mockConfig] of Object.entries(toolMocks)) {
      // API expects default_return_value as a string
      // If returnValue is an object, stringify it
      let returnValue = mockConfig.returnValue || '';
      if (typeof returnValue === 'object') {
        returnValue = JSON.stringify(returnValue);
      }

      toolMockConfig[toolName] = {
        default_return_value: returnValue,
        default_is_error: Boolean(mockConfig.error),
      };
    }

    simulationSpecification.tool_mock_config = toolMockConfig;
  }

  // Add dynamic variables if present in metadata
  if (conversation.metadata?.dynamic_variables) {
    simulationSpecification.dynamic_variables = conversation.metadata.dynamic_variables;
  }

  // Build main request object
  const request: Record<string, any> = {
    simulation_specification: simulationSpecification,
  };

  // Add extra evaluation criteria
  if (evaluationCriteria && evaluationCriteria.length > 0) {
    request.extra_evaluation_criteria = evaluationCriteria.map((criterion, index) => ({
      id: criterion.id || `criterion_${index}`,
      name: criterion.name,
      conversation_goal_prompt: criterion.description || criterion.name,
      use_knowledge_base: criterion.useKnowledgeBase ?? false,
    }));
  }

  return request;
}

/**
 * Format conversation history for display
 */
export function formatConversationHistory(
  turns: Array<{ speaker: string; message: string }>,
): string {
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
