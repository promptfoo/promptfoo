import type { ChatMessage } from '../types';
import { maybeFilePath } from './utils';

/**
 * Processes chat messages by resolving file references for content.
 * This handles the new messages format for chat-based prompts.
 *
 * @param messages - Array of chat messages with role and content
 * @param basePath - Base path for file resolution
 * @param fileProcessor - Function that processes file paths into content
 * @returns Promise resolving to processed messages with content loaded from files
 */
export async function processChatMessages(
  messages: ChatMessage[],
  basePath: string = '',
  fileProcessor: (filePath: string, basePath: string) => Promise<string>,
): Promise<ChatMessage[]> {
  if (!messages || !Array.isArray(messages)) {
    return [];
  }

  const processedMessages: ChatMessage[] = [];

  for (const message of messages) {
    if (!message.role || !message.content) {
      continue;
    }

    if (!maybeFilePath(message.content)) {
      // Content is not a file path, use as is
      processedMessages.push({
        ...message, // Preserve all properties of the original message
        content: message.content,
      });
      continue;
    }

    // Content is a file path, process it using provided file processor
    try {
      const processedContent = await fileProcessor(message.content, basePath);

      processedMessages.push({
        ...message, // Preserve all properties of the original message
        content: processedContent,
      });
    } catch {
      // If there's an error, use the original content
      processedMessages.push({
        ...message, // Preserve all properties of the original message
        content: message.content,
      });
    }
  }

  return processedMessages;
}
