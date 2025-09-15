import type { EvaluateTableOutput, EvaluateTableRow } from '@promptfoo/types';

// Types for normalized conversation data
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ConversationData {
  messages: Message[];
  finalPrompt: string;
  strategy: string;
  turnCount: number;
  summary: string;
}

// Helper function to detect if an output has conversation data
export function hasConversationData(output: EvaluateTableOutput): boolean {
  const metadata = output.metadata || {};
  const responseMetadata = output.response?.metadata || {};

  // Check for conversation indicators
  return !!(
    metadata.messages ||
    metadata.redteamHistory ||
    metadata.redteamTreeHistory ||
    responseMetadata.messages ||
    responseMetadata.redteamHistory ||
    responseMetadata.redteamTreeHistory ||
    metadata.redteamFinalPrompt ||
    responseMetadata.redteamFinalPrompt
  );
}

// Helper function to detect if the entire table has any conversations
export function hasAnyConversations(table: { body: EvaluateTableRow[] }): boolean {
  return table.body.some(row =>
    row.outputs.some(output => output && hasConversationData(output))
  );
}

// Helper function to normalize conversation data from various sources
export function normalizeConversationData(output: EvaluateTableOutput): ConversationData {
  const metadata = output.metadata || {};
  const responseMetadata = output.response?.metadata || {};

  // Merge metadata from both sources, with responseMetadata taking precedence
  const allMetadata = { ...metadata, ...responseMetadata };

  let messages: Message[] = [];
  let strategy = 'Unknown';

  // Extract messages from various sources
  if (allMetadata.messages) {
    try {
      // Handle both string and array formats
      if (typeof allMetadata.messages === 'string') {
        messages = JSON.parse(allMetadata.messages);
      } else if (Array.isArray(allMetadata.messages)) {
        messages = allMetadata.messages;
      }
      strategy = 'Chat';
    } catch (_e) {
      // If parsing fails, leave messages empty
    }
  } else if (allMetadata.redteamHistory) {
    // Convert redteamHistory format to standard message format
    strategy = 'Iterative';
    messages = allMetadata.redteamHistory.flatMap((entry: any) => [
      { role: 'user' as const, content: entry.prompt || '' },
      { role: 'assistant' as const, content: entry.output || '' },
    ]);
  } else if (allMetadata.redteamTreeHistory) {
    // Convert tree history format
    strategy = 'Tree Search';
    messages = allMetadata.redteamTreeHistory.flatMap((entry: any) => [
      { role: 'user' as const, content: entry.prompt || '' },
      { role: 'assistant' as const, content: entry.output || '' },
    ]);
  }

  // Detect strategy from metadata if not already set
  if (strategy === 'Unknown') {
    if (allMetadata.crescendoConfidence !== undefined) {
      strategy = 'Crescendo';
    } else if (allMetadata.customConfidence !== undefined) {
      strategy = 'Custom';
    } else if (allMetadata.redteamFinalPrompt) {
      strategy = 'RedTeam';
    }
  }

  const turnCount = messages.filter(m => m.role === 'user').length;
  const summary = generateConversationSummary(messages);

  return {
    messages,
    finalPrompt: allMetadata.redteamFinalPrompt || '',
    strategy,
    turnCount,
    summary,
  };
}

// Helper function to generate conversation summary
function generateConversationSummary(messages: Message[]): string {
  if (messages.length === 0) {
    return '';
  }

  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;
  const systemMessages = messages.filter(m => m.role === 'system').length;

  const parts = [];
  if (userMessages > 0) {
    parts.push(`${userMessages} user`);
  }
  if (assistantMessages > 0) {
    parts.push(`${assistantMessages} assistant`);
  }
  if (systemMessages > 0) {
    parts.push(`${systemMessages} system`);
  }

  return parts.length > 0 ? `${parts.join(', ')} messages` : '';
}