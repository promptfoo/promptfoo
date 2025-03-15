import type Anthropic from '@anthropic-ai/sdk';
import type { TokenUsage } from '../../types';
import { calculateCost as calculateCostBase } from '../shared';

// Model definitions with cost information
export const ANTHROPIC_MODELS = [
  // NOTE: Claude 2.x models are deprecated and will be retired on July 21, 2025.
  ...['claude-2.0'].map((model) => ({
    id: model,
    cost: {
      input: 0.008 / 1000,
      output: 0.024 / 1000,
    },
  })),
  ...['claude-2.1'].map((model) => ({
    id: model,
    cost: {
      input: 0.008 / 1000,
      output: 0.024 / 1000,
    },
  })),
  ...['claude-3-haiku-20240307', 'claude-3-haiku-latest'].map((model) => ({
    id: model,
    cost: {
      input: 0.00025 / 1000,
      output: 0.00125 / 1000,
    },
  })),
  ...['claude-3-opus-20240229', 'claude-3-opus-latest'].map((model) => ({
    id: model,
    cost: {
      input: 0.015 / 1000,
      output: 0.075 / 1000,
    },
  })),
  ...['claude-3-5-haiku-20241022', 'claude-3-5-haiku-latest'].map((model) => ({
    id: model,
    cost: {
      input: 1 / 1e6,
      output: 5 / 1e6,
    },
  })),
  ...[
    // NOTE: claude-3-sonnet-20240229 is deprecated and will be retired on July 21, 2025
    'claude-3-sonnet-20240229',
    'claude-3-sonnet-latest',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest',
    'claude-3-7-sonnet-20250219',
    'claude-3-7-sonnet-latest',
  ].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6,
      output: 15 / 1e6,
    },
  })),
];

export function outputFromMessage(message: Anthropic.Messages.Message, showThinking: boolean) {
  const hasToolUse = message.content.some((block) => block.type === 'tool_use');
  const hasThinking = message.content.some(
    (block) => block.type === 'thinking' || block.type === 'redacted_thinking',
  );

  if (hasToolUse || hasThinking) {
    return message.content
      .map((block) => {
        if (block.type === 'text') {
          return block.text;
        } else if (block.type === 'thinking' && showThinking) {
          return `Thinking: ${block.thinking}\nSignature: ${block.signature}`;
        } else if (block.type === 'redacted_thinking' && showThinking) {
          return `Redacted Thinking: ${block.data}`;
        } else if (block.type !== 'thinking' && block.type !== 'redacted_thinking') {
          return JSON.stringify(block);
        }
        return '';
      })
      .filter((text) => text !== '')
      .join('\n\n');
  }
  return message.content
    .map((block) => {
      return (block as Anthropic.Messages.TextBlock).text;
    })
    .join('\n\n');
}

export function parseMessages(messages: string): {
  system?: Anthropic.TextBlockParam[];
  extractedMessages: Anthropic.MessageParam[];
  thinking?: Anthropic.ThinkingConfigParam;
} {
  try {
    const parsed = JSON.parse(messages);
    if (Array.isArray(parsed)) {
      const systemMessage = parsed.find((msg) => msg.role === 'system');
      const thinking = parsed.find((msg) => msg.thinking)?.thinking;
      return {
        extractedMessages: parsed
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({
            role: msg.role,
            content: Array.isArray(msg.content)
              ? msg.content
              : [{ type: 'text', text: msg.content }],
          })),
        system: systemMessage
          ? Array.isArray(systemMessage.content)
            ? systemMessage.content
            : [{ type: 'text', text: systemMessage.content }]
          : undefined,
        thinking,
      };
    }
  } catch {
    // Not JSON, parse as plain text
  }
  const lines = messages
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);
  let system: Anthropic.TextBlockParam[] | undefined;
  let thinking: Anthropic.ThinkingConfigParam | undefined;
  const extractedMessages: Anthropic.MessageParam[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent: string[] = [];

  const pushMessage = () => {
    if (currentRole && currentContent.length > 0) {
      extractedMessages.push({
        role: currentRole,
        content: [{ type: 'text', text: currentContent.join('\n') }],
      });
      currentContent = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('system:')) {
      system = [{ type: 'text', text: line.slice(7).trim() }];
    } else if (line.startsWith('thinking:')) {
      try {
        thinking = JSON.parse(line.slice(9).trim());
      } catch {
        // Invalid thinking config, ignore
      }
    } else if (line.startsWith('user:') || line.startsWith('assistant:')) {
      pushMessage();
      currentRole = line.startsWith('user:') ? 'user' : 'assistant';
      currentContent.push(line.slice(line.indexOf(':') + 1).trim());
    } else if (currentRole) {
      currentContent.push(line);
    } else {
      // If no role is set, assume it's a user message
      currentRole = 'user';
      currentContent.push(line);
    }
  }

  pushMessage();

  if (extractedMessages.length === 0 && !system) {
    extractedMessages.push({
      role: 'user',
      content: [{ type: 'text', text: messages.trim() }],
    });
  }

  return { system, extractedMessages, thinking };
}

export function calculateAnthropicCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCostBase(modelName, config, promptTokens, completionTokens, ANTHROPIC_MODELS);
}

export function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    const total_tokens = data.usage.input_tokens + data.usage.output_tokens;
    if (cached) {
      return { cached: total_tokens, total: total_tokens };
    } else {
      return {
        total: total_tokens,
        prompt: data.usage.input_tokens || 0,
        completion: data.usage.output_tokens || 0,
      };
    }
  }
  return {};
}
