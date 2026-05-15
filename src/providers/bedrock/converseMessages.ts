import logger from '../../logger';
import type {
  ContentBlock,
  DocumentBlock,
  ImageBlock,
  Message,
  SystemContentBlock,
  ToolResultBlock,
  ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';

type JsonRecord = Record<string, unknown>;
type ConverseRole = 'user' | 'assistant';
type ImageFormat = ImageBlock['format'];
type DocumentFormat = DocumentBlock['format'];

interface ParsedConverseMessages {
  messages: Message[];
  system?: SystemContentBlock[];
}

const DOCUMENT_FORMATS = new Set<DocumentFormat>([
  'pdf',
  'csv',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'html',
  'txt',
  'md',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toImageFormat(value: unknown): ImageFormat {
  const format = typeof value === 'string' ? value.toLowerCase() : 'png';
  if (format === 'jpg') {
    return 'jpeg';
  }
  return format === 'jpeg' || format === 'gif' || format === 'webp' ? format : 'png';
}

function toDocumentFormat(value: unknown): DocumentFormat {
  return DOCUMENT_FORMATS.has(value as DocumentFormat) ? (value as DocumentFormat) : 'txt';
}

function decodeDataUrlBytes(
  value: string,
  pattern: RegExp,
):
  | {
      bytes: Buffer;
      format?: string;
    }
  | undefined {
  const match = value.match(pattern);
  if (!match) {
    return undefined;
  }
  return {
    format: match[1],
    bytes: Buffer.from(match[2] ?? match[1], 'base64'),
  };
}

function getSourceRecord(value: JsonRecord): JsonRecord | undefined {
  return asRecord(value.source);
}

function getImageData(block: JsonRecord): JsonRecord {
  return asRecord(block.image) ?? block;
}

function getDocumentData(block: JsonRecord): JsonRecord {
  return asRecord(block.document) ?? block;
}

function extractImageBytes(
  imageData: JsonRecord,
): { bytes: Buffer; format: ImageFormat } | undefined {
  const source = getSourceRecord(imageData);
  let format = toImageFormat(imageData.format);

  const mediaType = getString(source?.media_type);
  if (mediaType) {
    format = toImageFormat(mediaType.split('/')[1]);
  }

  const rawBytes = source?.bytes;
  if (typeof rawBytes === 'string') {
    if (rawBytes.startsWith('data:')) {
      const decoded = decodeDataUrlBytes(rawBytes, /^data:image\/([^;]+);base64,(.+)$/);
      if (decoded) {
        return { bytes: decoded.bytes, format: toImageFormat(decoded.format) };
      }
      return undefined;
    }
    return { bytes: Buffer.from(rawBytes, 'base64'), format };
  }
  if (Buffer.isBuffer(rawBytes)) {
    return { bytes: rawBytes, format };
  }

  const rawData = getString(source?.data);
  if (rawData) {
    return { bytes: Buffer.from(rawData, 'base64'), format };
  }

  return undefined;
}

function normalizeImageBlock(block: JsonRecord): ContentBlock | undefined {
  const imageData = getImageData(block);
  const extracted = extractImageBytes(imageData);
  if (!extracted) {
    logger.warn('Could not parse image content block', { block });
    return undefined;
  }
  return {
    image: {
      format: extracted.format,
      source: { bytes: extracted.bytes },
    },
  };
}

function normalizeImageUrlBlock(block: JsonRecord): ContentBlock | undefined {
  const imageUrlRecord = asRecord(block.image_url);
  const imageUrl = getString(imageUrlRecord?.url) ?? getString(block.url);
  if (!imageUrl || !imageUrl.startsWith('data:')) {
    logger.warn('Unsupported image_url format (only data URLs supported)', { imageUrl });
    return undefined;
  }

  const decoded = decodeDataUrlBytes(imageUrl, /^data:image\/([^;]+);base64,(.+)$/);
  if (!decoded) {
    return undefined;
  }

  return {
    image: {
      format: toImageFormat(decoded.format),
      source: { bytes: decoded.bytes },
    },
  };
}

function extractDocumentBytes(docData: JsonRecord): Buffer | undefined {
  const source = getSourceRecord(docData);
  const rawBytes = source?.bytes;
  if (typeof rawBytes === 'string') {
    if (rawBytes.startsWith('data:')) {
      return decodeDataUrlBytes(rawBytes, /^data:[^;]+;base64,(.+)$/)?.bytes;
    }
    return Buffer.from(rawBytes, 'base64');
  }
  return Buffer.isBuffer(rawBytes) ? rawBytes : undefined;
}

function normalizeDocumentBlock(block: JsonRecord): ContentBlock | undefined {
  const docData = getDocumentData(block);
  const bytes = extractDocumentBytes(docData);
  if (!bytes) {
    logger.warn('Could not parse document content block', { block });
    return undefined;
  }

  return {
    document: {
      format: toDocumentFormat(docData.format),
      name: getString(docData.name) ?? 'document',
      source: { bytes },
    },
  };
}

function normalizeToolUseBlock(block: JsonRecord): ContentBlock {
  const toolUseData = asRecord(block.toolUse) ?? block;
  const toolUse: ToolUseBlock = {
    toolUseId: getString(toolUseData.toolUseId) ?? getString(toolUseData.id),
    name: getString(toolUseData.name),
    input: toolUseData.input as ToolUseBlock['input'],
  };
  return { toolUse };
}

function normalizeToolResultContent(content: unknown): ToolResultBlock['content'] {
  if (Array.isArray(content)) {
    return content.map((item) => (typeof item === 'string' ? { text: item } : item));
  }
  return [{ text: String(content) }];
}

function normalizeToolResultBlock(block: JsonRecord): ContentBlock {
  const toolResultData = asRecord(block.toolResult) ?? block;
  const toolResult: ToolResultBlock = {
    toolUseId: getString(toolResultData.toolUseId) ?? getString(toolResultData.tool_use_id),
    content: normalizeToolResultContent(toolResultData.content),
    status: toolResultData.status as ToolResultBlock['status'],
  };
  return { toolResult };
}

function normalizeContentBlock(block: unknown): ContentBlock | undefined {
  if (typeof block === 'string') {
    return { text: block };
  }
  if (!isRecord(block)) {
    return { text: JSON.stringify(block) };
  }

  if (block.type === 'text') {
    return { text: getString(block.text) ?? String(block.text ?? '') };
  }
  if (block.type === 'image' || block.image) {
    return normalizeImageBlock(block);
  }
  if (block.type === 'image_url' || block.image_url) {
    return normalizeImageUrlBlock(block);
  }
  if (block.type === 'document' || block.document) {
    return normalizeDocumentBlock(block);
  }
  if (block.type === 'tool_use' || block.toolUse) {
    return normalizeToolUseBlock(block);
  }
  if (block.type === 'tool_result' || block.toolResult) {
    return normalizeToolResultBlock(block);
  }
  return { text: JSON.stringify(block) };
}

function normalizeMessageContent(content: unknown): ContentBlock[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => normalizeContentBlock(block))
      .filter((block): block is ContentBlock => Boolean(block));
  }
  return [{ text: JSON.stringify(content) }];
}

function parseJsonMessage(value: unknown):
  | {
      role: 'system' | ConverseRole;
      content: unknown;
    }
  | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.role !== 'system' && value.role !== 'user' && value.role !== 'assistant') {
    return undefined;
  }
  return { role: value.role, content: value.content };
}

export function parseJsonConverseMessages(prompt: string): ParsedConverseMessages | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(prompt);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const systemMessages: SystemContentBlock[] = [];
  const messages: Message[] = [];

  for (const rawMessage of parsed) {
    const message = parseJsonMessage(rawMessage);
    if (!message) {
      continue;
    }
    if (message.role === 'system') {
      systemMessages.push({
        text:
          typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      });
      continue;
    }
    messages.push({
      role: message.role,
      content: normalizeMessageContent(message.content),
    });
  }

  return {
    messages,
    system: systemMessages.length > 0 ? systemMessages : undefined,
  };
}

export function parseLineBasedConverseMessages(prompt: string): ParsedConverseMessages {
  const messages: Message[] = [];
  const lines = prompt.split('\n');
  let system: SystemContentBlock[] | undefined;
  let currentRole: ConverseRole | null = null;
  let currentContent: string[] = [];

  const pushMessage = () => {
    if (!currentRole || currentContent.length === 0) {
      return;
    }
    messages.push({
      role: currentRole,
      content: [{ text: currentContent.join('\n') }],
    });
    currentContent = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    const lower = trimmedLine.toLowerCase();

    if (lower.startsWith('system:')) {
      pushMessage();
      system = [{ text: trimmedLine.slice(7).trim() }];
      currentRole = null;
      continue;
    }
    if (lower.startsWith('user:')) {
      pushMessage();
      currentRole = 'user';
      const content = trimmedLine.slice(5).trim();
      if (content) {
        currentContent.push(content);
      }
      continue;
    }
    if (lower.startsWith('assistant:')) {
      pushMessage();
      currentRole = 'assistant';
      const content = trimmedLine.slice(10).trim();
      if (content) {
        currentContent.push(content);
      }
      continue;
    }
    if (!currentRole) {
      currentRole = 'user';
    }
    currentContent.push(line);
  }

  pushMessage();

  if (messages.length === 0) {
    messages.push({
      role: 'user',
      content: [{ text: prompt }],
    });
  }

  return { messages, system };
}
