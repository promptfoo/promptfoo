export interface Document {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

export interface AIResponse {
  response: string;
  toolCalls: ToolCall[];
  suggestedEdit?: {
    content: string;
    position: 'append' | 'prepend' | 'replace';
  };
}
