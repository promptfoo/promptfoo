import type { Agent } from 'http';

import { getEnvString } from '../../envars';

const REQUEST_TIMEOUT_MS = 300_000; // 5 minutes

export function hasProxyEnv(): boolean {
  return Boolean(getEnvString('HTTP_PROXY') || getEnvString('HTTPS_PROXY'));
}

/**
 * Creates a NodeHttpHandler (HTTP/1.1) for Bedrock SDK clients.
 *
 * The @aws-sdk/client-bedrock-runtime package defaults to HTTP/2, which causes
 * "http2 request did not get a response" errors in many environments (see #7756).
 * This function forces HTTP/1.1 via NodeHttpHandler.
 *
 * For @aws-sdk/client-bedrock-agent-runtime (which already defaults to HTTP/1.1),
 * this is only needed when proxy or API key authentication is required.
 */
export async function createBedrockRequestHandler(options?: {
  apiKey?: string;
}): Promise<{ handle: (...args: any[]) => any }> {
  const hasProxy = hasProxyEnv();

  try {
    const { NodeHttpHandler } = await import('@smithy/node-http-handler');
    let proxyAgent: Agent | undefined;
    if (hasProxy) {
      const { ProxyAgent } = await import('proxy-agent');
      proxyAgent = new ProxyAgent() as unknown as Agent;
    }

    const handler = new NodeHttpHandler({
      ...(proxyAgent ? { httpsAgent: proxyAgent } : {}),
      requestTimeout: REQUEST_TIMEOUT_MS,
    });

    if (options?.apiKey) {
      const originalHandle = handler.handle.bind(handler);
      handler.handle = async (request: any, handlerOptions?: any) => {
        request.headers = {
          ...request.headers,
          Authorization: `Bearer ${options.apiKey}`,
        };
        return originalHandle(request, handlerOptions);
      };
    }

    return handler;
  } catch {
    const reason = options?.apiKey
      ? 'API key authentication requires the @smithy/node-http-handler package'
      : hasProxy
        ? 'Proxy configuration requires the @smithy/node-http-handler package'
        : 'Bedrock provider requires the @smithy/node-http-handler package';
    throw new Error(`${reason}. Please install it in your project or globally.`);
  }
}

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
  const hasToolUse = response.output?.message?.content.some((block) => block.toolUse?.toolUseId);
  if (hasToolUse) {
    return response.output?.message?.content
      .map((block) => {
        if (block.text) {
          // Filter out text for tool use blocks.
          // Observed nova-lite wrapping tool use blocks with text blocks.
          return null;
        }
        return JSON.stringify(block.toolUse);
      })
      .filter((block) => block)
      .join('\n\n');
  }
  return response.output?.message?.content
    .map((block) => {
      return block.text;
    })
    .join('\n\n');
}

interface TextBlockParam {
  text: string;
}

interface ImageBlockParam {
  image: {
    format: 'jpeg' | 'png' | 'gif' | 'webp';
    source: {
      bytes: Uint8Array | string; // Binary array or Base64-encoded string
    };
  };
}

interface ToolUseBlockParam {
  id: string;
  input: unknown;
  name: string;
}

interface ToolResultBlockParam {
  toolUseId: string;
  content?: string | Array<TextBlockParam | ImageBlockParam>;
  status?: string;
}

interface MessageParam {
  content:
    | string
    | Array<TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam>;

  role: 'user' | 'assistant';
}

/** Amazon Nova accepts these image formats in `{ image: { format, source } }` blocks. */
function novaImageFormat(mimeType?: string): ImageBlockParam['image']['format'] | undefined {
  const subtype = mimeType?.toLowerCase().split('/')[1]?.split(';')[0]?.trim();
  switch (subtype) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'gif':
      return 'gif';
    case 'webp':
      return 'webp';
    default:
      return undefined;
  }
}

/**
 * Build a Nova image block from a data URI or raw base64 string. Returns
 * undefined when the MIME type isn't a Nova-supported image format, so callers
 * can leave the original part untouched.
 */
function novaImageBlock(base64OrDataUri: string, mimeType?: string): ImageBlockParam | undefined {
  let mime = mimeType;
  let bytes = base64OrDataUri.trim();
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/is.exec(bytes);
  if (match) {
    mime = match[1];
    bytes = match[2];
  }
  const format = novaImageFormat(mime);
  if (!format) {
    return undefined;
  }
  return { image: { format, source: { bytes: bytes.replace(/\s/g, '') } } };
}

/**
 * Normalize a single message content part into Amazon Nova's content-block
 * shape. Converts OpenAI (`image_url`/`text`), Responses (`input_image`/
 * `input_text`), Anthropic (`image`/`text`), and Google (`inlineData`) parts to
 * Nova `{ text }` / `{ image: { format, source: { bytes } } }` blocks. Parts
 * already in Nova shape, tool blocks, and unrecognized parts pass through
 * unchanged so existing behavior is preserved.
 */
function novaNormalizeContentPart(part: unknown): unknown {
  if (typeof part === 'string') {
    return { text: part };
  }
  if (!part || typeof part !== 'object') {
    return part;
  }
  const block = part as Record<string, unknown>;

  // Already Nova-shaped, or a tool block -> leave untouched.
  if (typeof block.text === 'string' && !('type' in block)) {
    return block;
  }
  if ('image' in block || 'toolUse' in block || 'toolResult' in block) {
    return block;
  }

  const type = typeof block.type === 'string' ? block.type : undefined;

  if ((type === 'text' || type === 'input_text') && typeof block.text === 'string') {
    return { text: block.text };
  }

  // OpenAI: { type: 'image_url', image_url: { url } }
  if (
    type === 'image_url' &&
    block.image_url &&
    typeof block.image_url === 'object' &&
    typeof (block.image_url as { url?: unknown }).url === 'string'
  ) {
    const novaBlock = novaImageBlock((block.image_url as { url: string }).url);
    if (novaBlock) {
      return novaBlock;
    }
  }

  // Responses: { type: 'input_image', image_url: 'data:...' }
  if (type === 'input_image' && typeof block.image_url === 'string') {
    const novaBlock = novaImageBlock(block.image_url);
    if (novaBlock) {
      return novaBlock;
    }
  }

  // Anthropic: { type: 'image', source: { type: 'base64', media_type, data } }
  if (type === 'image' && block.source && typeof block.source === 'object') {
    const source = block.source as { media_type?: unknown; data?: unknown };
    if (typeof source.data === 'string') {
      const novaBlock = novaImageBlock(
        source.data,
        typeof source.media_type === 'string' ? source.media_type : undefined,
      );
      if (novaBlock) {
        return novaBlock;
      }
    }
  }

  // Google: { inlineData: { mimeType, data } }
  if (block.inlineData && typeof block.inlineData === 'object') {
    const inline = block.inlineData as { mimeType?: unknown; data?: unknown };
    if (typeof inline.data === 'string') {
      const novaBlock = novaImageBlock(
        inline.data,
        typeof inline.mimeType === 'string' ? inline.mimeType : undefined,
      );
      if (novaBlock) {
        return novaBlock;
      }
    }
  }

  return part;
}

/**
 * Normalize an Amazon Nova message's `content` into an array of Nova content
 * blocks. String content becomes a single text block (matching prior behavior);
 * array content has each part normalized via {@link novaNormalizeContentPart}.
 */
export function novaNormalizeContent(content: unknown): MessageParam['content'] {
  if (Array.isArray(content)) {
    return content.map(novaNormalizeContentPart) as MessageParam['content'];
  }
  return [{ text: content as string }];
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
            content: novaNormalizeContent(msg.content),
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
