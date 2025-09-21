/**
 * Types for LiveKit provider integration
 */

export interface LiveKitConfig {
  url?: string;
  apiKey: string;      // Required for LiveKit authentication
  apiSecret: string;   // Required for LiveKit authentication
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
  audioUrl?: string;      // URL to audio response file
  videoUrl?: string;      // URL to video response file
  audioData?: string;     // Base64 encoded audio data
  videoData?: string;     // Base64 encoded video data
  metadata?: {
    sessionId?: string;
    timestamp?: string;
    inputModalities?: string[];
    responseModalities?: string[];
    toolCalls?: ToolCall[];
    duration?: number;    // Response duration in ms
    format?: string;      // Audio/video format (mp3, wav, mp4, etc.)
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: 'success' | 'error';
}

export interface JobProcess {
  userData: Record<string, any>;
  pid: number;
  startTime: number;
}

export interface AgentJob {
  id: string;
  type: string;
  room: {
    name: string;
    sid: string;
  };
}

export interface AgentContext {
  room: any; // Room from livekit-client
  sessionId: string;
  userData: Record<string, any>;
  config: LiveKitConfig;
  proc: JobProcess;
  workerId: string;
  job: AgentJob;
  sendMessage?: (input: string) => Promise<AgentResponse>;
}

export interface LiveKitAgent {
  prewarm?: (proc: JobProcess) => Promise<void>;
  entry: (ctx: AgentContext) => Promise<void>;
  config?: {
    name?: string;
    version?: string;
    description?: string;
    capabilities?: string[];
    framework?: string;
  };
  tools?: Array<{
    name: string;
    description: string;
    function: (args: Record<string, any>, context?: AgentContext) => Promise<any>;
  }>;
}