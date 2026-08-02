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
