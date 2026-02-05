/**
 * Tool call extraction and validation for ElevenLabs Agents
 */

import logger from '../../../logger';

import type { ConversationTurn, ToolCall } from './types';

/**
 * Extract tool calls from conversation history
 */
export function extractToolCalls(history: ConversationTurn[]): ToolCall[] {
  logger.debug('[ElevenLabs Agents] Extracting tool calls', {
    turnCount: history.length,
  });

  const toolCalls: ToolCall[] = [];

  for (const turn of history) {
    if (turn.metadata?.toolCalls) {
      toolCalls.push(...turn.metadata.toolCalls);
    }
  }

  logger.debug('[ElevenLabs Agents] Tool calls extracted', {
    count: toolCalls.length,
  });

  return toolCalls;
}

/**
 * Validate tool call arguments against schema
 */
export function validateToolCall(
  toolCall: ToolCall,
  schema?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  },
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema) {
    return { valid: true, errors: [] };
  }

  // Check required fields
  if (schema.required) {
    for (const requiredField of schema.required) {
      if (!(requiredField in toolCall.arguments)) {
        errors.push(`Missing required argument: ${requiredField}`);
      }
    }
  }

  // Validate field types (basic validation)
  for (const [fieldName, value] of Object.entries(toolCall.arguments)) {
    const fieldSchema = schema.properties[fieldName];

    if (!fieldSchema) {
      errors.push(`Unknown argument: ${fieldName}`);
      continue;
    }

    // Type checking
    if (fieldSchema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (fieldSchema.type !== actualType) {
        errors.push(
          `Argument ${fieldName} has wrong type: expected ${fieldSchema.type}, got ${actualType}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Analyze tool usage patterns
 */
export function analyzeToolUsage(toolCalls: ToolCall[]): {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageLatency: number;
  callsByTool: Map<string, number>;
  errorsByTool: Map<string, string[]>;
} {
  const callsByTool = new Map<string, number>();
  const errorsByTool = new Map<string, string[]>();
  let successfulCalls = 0;
  let failedCalls = 0;
  let totalLatency = 0;

  for (const call of toolCalls) {
    // Count by tool name
    callsByTool.set(call.name, (callsByTool.get(call.name) || 0) + 1);

    // Track success/failure
    if (call.error) {
      failedCalls++;
      const errors = errorsByTool.get(call.name) || [];
      errors.push(call.error);
      errorsByTool.set(call.name, errors);
    } else {
      successfulCalls++;
    }

    // Track latency
    if (call.latency_ms) {
      totalLatency += call.latency_ms;
    }
  }

  return {
    totalCalls: toolCalls.length,
    successfulCalls,
    failedCalls,
    averageLatency: toolCalls.length > 0 ? totalLatency / toolCalls.length : 0,
    callsByTool,
    errorsByTool,
  };
}

/**
 * Generate tool usage summary
 */
export function generateToolUsageSummary(toolCalls: ToolCall[]): string {
  const analysis = analyzeToolUsage(toolCalls);
  const lines: string[] = [];

  lines.push(`Tool Calls: ${analysis.totalCalls}`);
  lines.push(`  Successful: ${analysis.successfulCalls}`);
  lines.push(`  Failed: ${analysis.failedCalls}`);

  if (analysis.totalCalls > 0) {
    lines.push(`  Average Latency: ${analysis.averageLatency.toFixed(0)}ms`);
  }

  if (analysis.callsByTool.size > 0) {
    lines.push('');
    lines.push('Calls by Tool:');
    for (const [toolName, count] of analysis.callsByTool.entries()) {
      lines.push(`  ${toolName}: ${count}`);
    }
  }

  if (analysis.errorsByTool.size > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const [toolName, errors] of analysis.errorsByTool.entries()) {
      lines.push(`  ${toolName}:`);
      errors.forEach((error) => {
        lines.push(`    - ${error}`);
      });
    }
  }

  return lines.join('\n');
}

/**
 * Common agent tools
 */
export const COMMON_AGENT_TOOLS = {
  getWeather: {
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object' as const,
      properties: {
        location: {
          type: 'string',
          description: 'City name or ZIP code',
        },
        units: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature units',
        },
      },
      required: ['location'],
    },
  },

  searchKnowledgeBase: {
    name: 'search_knowledge_base',
    description: 'Search internal knowledge base for information',
    parameters: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return',
        },
      },
      required: ['query'],
    },
  },

  createTicket: {
    name: 'create_ticket',
    description: 'Create a support ticket',
    parameters: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Ticket title',
        },
        description: {
          type: 'string',
          description: 'Detailed description',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Ticket priority',
        },
      },
      required: ['title', 'description'],
    },
  },

  sendEmail: {
    name: 'send_email',
    description: 'Send an email',
    parameters: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },

  scheduleAppointment: {
    name: 'schedule_appointment',
    description: 'Schedule an appointment',
    parameters: {
      type: 'object' as const,
      properties: {
        datetime: {
          type: 'string',
          description: 'ISO 8601 datetime',
        },
        duration_minutes: {
          type: 'number',
          description: 'Appointment duration',
        },
        attendees: {
          type: 'array',
          description: 'List of attendee emails',
        },
      },
      required: ['datetime'],
    },
  },
};
