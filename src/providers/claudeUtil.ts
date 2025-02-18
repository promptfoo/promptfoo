import type {
  TextBlockParam,
  ImageBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
} from './bedrockUtil';

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | (TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam)[];
}

export interface ClaudeInstance {
  messages: ClaudeMessage[];
  system?: string;
}

export interface ClaudeResponse {
  predictions?: Array<{
    content: string;
    usage?: {
      total_tokens: number;
      prompt_tokens: number;
      completion_tokens: number;
    };
  }>;
  error?: {
    code: string;
    message: string;
  };
}

export function formatClaudeMessages(extractedMessages: any[], system?: any[]): ClaudeInstance {
  const instance: ClaudeInstance = {
    messages: extractedMessages.map((msg) => ({
      role: msg.role,
      content:
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .map((c: any) => {
                if ('text' in c) {
                  return c.text;
                }
                return JSON.stringify(c);
              })
              .join('\n'),
    })),
  };

  if (system?.length) {
    instance.system = system[0].text;
  }

  return instance;
}

export function formatClaudeResponse(data: ClaudeResponse) {
  if (data.error) {
    return {
      error: `Error ${data.error.code}: ${data.error.message}`,
    };
  }

  const prediction = data.predictions?.[0];
  if (!prediction) {
    return {
      error: 'No prediction found in response',
    };
  }

  return {
    output: prediction.content,
    tokenUsage: prediction.usage
      ? {
          total: prediction.usage.total_tokens,
          prompt: prediction.usage.prompt_tokens,
          completion: prediction.usage.completion_tokens,
        }
      : undefined,
  };
}
