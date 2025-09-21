/**
 * Types for LiveKit provider integration
 */

export interface LiveKitConfig {
  url?: string;
  apiKey?: string;
  apiSecret?: string;
  roomName?: string;
  participantName?: string;
  sessionTimeout?: number;
  enableAudio?: boolean;
  enableVideo?: boolean;
  enableChat?: boolean;
}

export interface MultiModalInput {
  text?: string;
  audioUrl?: string;
  videoUrl?: string;
}

export interface AgentResponse {
  response: string;
  metadata?: {
    sessionId?: string;
    timestamp?: string;
    inputModalities?: string[];
    responseModalities?: string[];
    toolCalls?: ToolCall[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: 'success' | 'error';
}

export interface LiveKitAgent {
  prewarm?: (proc: any) => Promise<void>;
  entry: (ctx: any) => Promise<void>;
  config?: {
    name?: string;
    version?: string;
    description?: string;
  };
  tools?: Array<{
    name: string;
    description: string;
    function: (args: Record<string, any>) => Promise<any>;
  }>;
}