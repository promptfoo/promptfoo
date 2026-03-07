import type { ProviderResponse } from '../types/index';

export interface ExtractedToolCall {
  name: string;
  args?: Record<string, unknown>;
}

/**
 * Extracts ordered tool calls from provider response output and metadata.
 *
 * Checks in order:
 * 1. providerResponse.metadata.toolCalls (agent SDK format)
 * 2. Output object with tool_calls (OpenAI format)
 * 3. Output array of content blocks (Anthropic format)
 * 4. Output with functionCall/toolCall (Google/Vertex format)
 * 5. String output (JSON-parsed)
 */
export function extractToolCalls(
  output: unknown,
  providerResponse?: ProviderResponse,
): ExtractedToolCall[] {
  const calls: ExtractedToolCall[] = [];

  // 1. Check metadata.toolCalls (agent SDK providers like claude-agent-sdk)
  if (providerResponse?.metadata?.toolCalls && Array.isArray(providerResponse.metadata.toolCalls)) {
    for (const tc of providerResponse.metadata.toolCalls) {
      if (tc && typeof tc === 'object' && typeof tc.name === 'string') {
        calls.push({
          name: tc.name,
          args:
            tc.input && typeof tc.input === 'object'
              ? (tc.input as Record<string, unknown>)
              : undefined,
        });
      }
    }
    if (calls.length > 0) {
      return calls;
    }
  }

  // 2. Extract from output
  extractToolCallsFromOutput(output, calls);
  return calls;
}

function extractToolCallsFromOutput(output: unknown, calls: ExtractedToolCall[]): void {
  if (output === null || output === undefined) {
    return;
  }

  // Handle string output - try to parse as JSON
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      extractToolCallsFromOutput(parsed, calls);
      return;
    } catch {
      // Try line-by-line parsing
    }

    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          extractToolCallsFromOutput(parsed, calls);
        } catch {
          // Not valid JSON
        }
      }
    }
    return;
  }

  if (typeof output !== 'object') {
    return;
  }

  const obj = output as Record<string, unknown>;

  // OpenAI format: { tool_calls: [{ function: { name, arguments } }] }
  if ('tool_calls' in obj && Array.isArray(obj.tool_calls)) {
    for (const tc of obj.tool_calls) {
      if (tc && typeof tc === 'object') {
        const toolCall = tc as Record<string, unknown>;
        if (toolCall.function && typeof toolCall.function === 'object') {
          const fn = toolCall.function as Record<string, unknown>;
          if (typeof fn.name === 'string') {
            let args: Record<string, unknown> | undefined;
            if (typeof fn.arguments === 'string') {
              try {
                args = JSON.parse(fn.arguments);
              } catch {
                // Not valid JSON args
              }
            } else if (fn.arguments && typeof fn.arguments === 'object') {
              args = fn.arguments as Record<string, unknown>;
            }
            calls.push({ name: fn.name, args });
          }
        }
        if (typeof toolCall.name === 'string' && !toolCall.function) {
          calls.push({
            name: toolCall.name,
            args:
              toolCall.input && typeof toolCall.input === 'object'
                ? (toolCall.input as Record<string, unknown>)
                : undefined,
          });
        }
      }
    }
    return;
  }

  // Anthropic single tool_use block
  if (obj.type === 'tool_use' && typeof obj.name === 'string') {
    calls.push({
      name: obj.name,
      args:
        obj.input && typeof obj.input === 'object'
          ? (obj.input as Record<string, unknown>)
          : undefined,
    });
    return;
  }

  // Google/Vertex: { functionCall: { name, args } }
  if ('functionCall' in obj && obj.functionCall && typeof obj.functionCall === 'object') {
    const fc = obj.functionCall as Record<string, unknown>;
    if (typeof fc.name === 'string') {
      calls.push({
        name: fc.name,
        args:
          fc.args && typeof fc.args === 'object' ? (fc.args as Record<string, unknown>) : undefined,
      });
    }
    return;
  }

  // Google Live: { toolCall: { functionCalls: [...] } }
  if ('toolCall' in obj && obj.toolCall && typeof obj.toolCall === 'object') {
    const toolCall = obj.toolCall as Record<string, unknown>;
    if ('functionCalls' in toolCall && Array.isArray(toolCall.functionCalls)) {
      for (const fc of toolCall.functionCalls) {
        if (
          fc &&
          typeof fc === 'object' &&
          typeof (fc as Record<string, unknown>).name === 'string'
        ) {
          const fcObj = fc as Record<string, unknown>;
          calls.push({
            name: fcObj.name as string,
            args:
              fcObj.args && typeof fcObj.args === 'object'
                ? (fcObj.args as Record<string, unknown>)
                : undefined,
          });
        }
      }
    }
    return;
  }

  // Handle arrays (content blocks)
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item && typeof item === 'object') {
        const block = item as Record<string, unknown>;

        if (block.type === 'tool_use' && typeof block.name === 'string') {
          calls.push({
            name: block.name,
            args:
              block.input && typeof block.input === 'object'
                ? (block.input as Record<string, unknown>)
                : undefined,
          });
          continue;
        }

        if (
          'functionCall' in block &&
          block.functionCall &&
          typeof block.functionCall === 'object'
        ) {
          const fc = block.functionCall as Record<string, unknown>;
          if (typeof fc.name === 'string') {
            calls.push({
              name: fc.name,
              args:
                fc.args && typeof fc.args === 'object'
                  ? (fc.args as Record<string, unknown>)
                  : undefined,
            });
          }
          continue;
        }

        if (block.function && typeof block.function === 'object') {
          const fn = block.function as Record<string, unknown>;
          if (typeof fn.name === 'string') {
            let args: Record<string, unknown> | undefined;
            if (typeof fn.arguments === 'string') {
              try {
                args = JSON.parse(fn.arguments);
              } catch {
                // Not valid JSON
              }
            } else if (fn.arguments && typeof fn.arguments === 'object') {
              args = fn.arguments as Record<string, unknown>;
            }
            calls.push({ name: fn.name, args });
          }
          continue;
        }

        if (
          typeof block.name === 'string' &&
          (block.type === 'function' || block.type === 'tool_call')
        ) {
          calls.push({
            name: block.name,
            args:
              block.input && typeof block.input === 'object'
                ? (block.input as Record<string, unknown>)
                : undefined,
          });
        }
      }
    }
  }
}
