import type { Agent } from 'http';

import { getEnvString } from '../../envars';
import { sha256 } from '../../util/createHash';

const REQUEST_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Matches the geo/global prefix of a system-defined inference profile ID, e.g. the
 * `us.` in `us.anthropic.claude-sonnet-4-6`.
 *
 * See https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
 */
export const INFERENCE_PROFILE_PREFIX = /^(?:us|us-gov|eu|apac|global|jp|au|ca|in)\./;

/** Decode declared AWS blob fields, including the byte forms stored in eval JSON. */
export function decodeBedrockBytes(data: unknown): Uint8Array | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (typeof data === 'string') {
    return Buffer.from(data, 'base64');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  const invalid =
    'Invalid Bedrock byte content: expected base64 or a native/serialized byte array.';
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(invalid);
  }
  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  const bufferData =
    keys.length === 2 && record.type === 'Buffer' && Array.isArray(record.data)
      ? record.data
      : undefined;
  const bytes = new Uint8Array(bufferData?.length ?? keys.length);
  for (let index = 0; index < bytes.length; index++) {
    if (!bufferData && keys[index] !== String(index)) {
      throw new Error(invalid);
    }
    const value = bufferData ? bufferData[index] : record[String(index)];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(invalid);
    }
    bytes[index] = value;
  }
  return bytes;
}

/** Hash binary inputs without expanding their bytes into JSON cache-key entries. */
export function hashBedrockConfig(value: unknown): string {
  const replaceBinary = (item: unknown) =>
    ArrayBuffer.isView(item)
      ? { $bytesSha256: sha256(Buffer.from(item.buffer, item.byteOffset, item.byteLength)) }
      : item;
  return sha256(
    JSON.stringify(replaceBinary(value), (_key, item) => {
      // Replace children before JSON.stringify can call Buffer.toJSON on them.
      if (Array.isArray(item)) {
        return item.map(replaceBinary);
      }
      return item && typeof item === 'object'
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, replaceBinary(item[key])]),
          )
        : item;
    }),
  );
}

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
 * Agent Runtime uses this handler only for proxy support; it requires SigV4.
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
