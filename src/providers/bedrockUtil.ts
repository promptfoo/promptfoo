interface AmazonResponse {
  output?: {
    message?: {
      role: string;
      content: {
        text?: string;
        toolUse?: {
          name: string;
          toolUseId: string;
          input: any;
        };
      }[];
    };
  };
  stopReason?: string;
  usage?: {
    cacheReadInputTokenCount?: number;
    cacheWriteInputTokenCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export function novaOutputFromMessage(response: AmazonResponse) {
  // Check for thinking blocks in the response if they exist in the future
  // Currently Nova doesn't support thinking blocks, but this will make it future-proof
  const hasToolUse = response.output?.message?.content.some((block) => block.toolUse?.toolUseId);
  const textBlocks = response.output?.message?.content.filter(block => block.text);
  
  if (hasToolUse) {
    const toolUseBlocks = response.output?.message?.content
      .map((block) => {
        if (block.text) {
          // Filter out text for tool use blocks.
          return '';
        }
        return JSON.stringify(block.toolUse);
      })
      .filter(Boolean)
      .join('\n\n');

    return {
      output: toolUseBlocks || '',
      reasoning: undefined, // Nova doesn't support thinking yet, but adding for consistency
    };
  }
  
  return {
    output: textBlocks?.map(block => block.text).join('\n\n') || '',
    reasoning: undefined, // Nova doesn't support thinking yet, but adding for consistency
  };
}

export interface TextBlockParam {
  text: string;
}

export interface ImageBlockParam {
  image: {
    format: 'jpeg' | 'png' | 'gif' | 'webp';
    source: {
      bytes: Uint8Array | string; // Binary array or Base64-encoded string
    };
  };
}

export interface VideoBlockParam {
  video: {
    format: 'mkv' | 'mov' | 'mp4' | 'webm' | 'three_gp' | 'flv' | 'mpeg' | 'mpg' | 'wmv';
    source: {
      s3Location?: {
        uri: string;
        bucketOwner?: string;
      };
      bytes?: Uint8Array | string; // Binary array or Base64-encoded string
    };
  };
}

export interface ToolUseBlockParam {
  id: string;
  input: unknown;
  name: string;
}

export interface ToolResultBlockParam {
  toolUseId: string;
  content?: string | Array<TextBlockParam | ImageBlockParam>;
  status?: string;
}

export interface MessageParam {
  content:
    | string
    | Array<TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam>;

  role: 'user' | 'assistant';
}

export function novaParseMessages(messages: string): {
  system?: TextBlockParam[];
  extractedMessages: MessageParam[];
} {
  try {
    const parsed = JSON.parse(messages);
    if (Array.isArray(parsed)) {
      const systemMessage = parsed.find((msg) => msg.role === 'system');
      return {
        extractedMessages: parsed
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({
            role: msg.role,
            content: Array.isArray(msg.content) ? msg.content : [{ text: msg.content }],
          })),
        system: systemMessage
          ? Array.isArray(systemMessage.content)
            ? systemMessage.content
            : [{ text: systemMessage.content }]
          : undefined,
      };
    }
  } catch {
    // Not JSON, parse as plain text
  }
  const lines = messages
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);
  let system: TextBlockParam[] | undefined;
  const extractedMessages: MessageParam[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent: string[] = [];

  const pushMessage = () => {
    if (currentRole && currentContent.length > 0) {
      extractedMessages.push({
        role: currentRole,
        content: [{ text: currentContent.join('\n') }],
      });
      currentContent = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('system:')) {
      system = [{ text: line.slice(7).trim() }];
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
      content: [{ text: messages.trim() }],
    });
  }

  return { system, extractedMessages };
}
