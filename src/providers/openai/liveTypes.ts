import type OpenAI from 'openai';

import type { LiveAudioFormat, LiveInputMessage } from './liveInput';
import type { OpenAiSharedOptions } from './types';

export interface LiveTranscriptDelta {
  role: 'user' | 'assistant';
  delta: string;
  start_ms: number;
  end_ms: number;
}

type ResponsesBackend = Pick<
  OpenAI.Responses.ResponseCreateParamsNonStreaming,
  | 'instructions'
  | 'max_output_tokens'
  | 'parallel_tool_calls'
  | 'reasoning'
  | 'service_tier'
  | 'text'
  | 'tool_choice'
> & {
  model: string;
  tools?: (OpenAI.Responses.FunctionTool | { type: 'web_search' })[];
};

export type LiveDelegationHandler = (
  request: {
    id: string;
    offsetMs: number;
    input: LiveInputMessage[];
    transcript: LiveTranscriptDelta[];
  },
  signal: AbortSignal,
) => Promise<string>;
export type LiveFunctionCallHandler = (
  name: string,
  args: string,
  signal: AbortSignal,
) => Promise<string>;

export interface OpenAiLiveOptions extends OpenAiSharedOptions {
  instructions?: string;
  audio?: { format?: LiveAudioFormat; output?: { voice?: string | { id: string } } };
  delegation?: { type: 'client' } | { type: 'responses'; responses: ResponsesBackend };
  delegationHandler?: LiveDelegationHandler | string;
  functionCallHandler?: LiveFunctionCallHandler | string;
  /** Per-session limit, counted separately, on function calls and client delegations (1-64, default 8). */
  maxToolIterations?: number;
  /** Silence streamed after the input clip (or for the entire text-seeded eval). */
  responseWindowMs?: number;
  websocketTimeout?: number;
  closeTimeoutMs?: number;
  costPerMinute?: number;
}
