import { v4 as uuidv4 } from 'uuid';

import type { Message } from '../shared';

export class MemorySystem {
  private conversations: Map<string, Message[]> = new Map();

  addMessage(conversationId: string, message: Message) {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, []);
    }
    this.conversations.get(conversationId)!.push(message);
  }

  getConversation(conversationId: string): Message[] {
    return this.conversations.get(conversationId) || [];
  }

  duplicateConversationExcludingLastTurn(conversationId: string): string {
    const originalConversation = this.getConversation(conversationId);
    const newConversationId = uuidv4();
    const newConversation = originalConversation.slice(0, -2); // Remove last turn (user + assistant)
    this.conversations.set(newConversationId, newConversation);
    return newConversationId;
  }
} 