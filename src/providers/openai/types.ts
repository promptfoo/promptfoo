import type OpenAI from 'openai';
import { type OpenAiFunction, type OpenAiTool } from './util';

export interface OpenAiSharedOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  cost?: number;
  headers?: { [key: string]: string };
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

export type OpenAiCompletionOptions = OpenAiSharedOptions & {
  temperature?: number;
  max_completion_tokens?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: OpenAiFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: OpenAiTool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  response_format?:
    | {
        type: 'json_object';
      }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict: boolean;
          schema: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
            additionalProperties: false;
          };
        };
      };
  stop?: string[];
  seed?: number;
  passthrough?: object;
  reasoning_effort?: ReasoningEffort;
  modalities?: string[];
  /**
   * Audio configuration for audio-capable models like gpt-4o-audio-preview and gpt-4o-mini-audio-preview.
   * Used for generating audio outputs and processing audio inputs.
   *
   * For audio inputs:
   * - Load an audio file in evaluatorHelpers.ts which will convert it to base64
   * - Use with {{ your_audio.wav }} in the prompt or __AUDIO_FILE:your_audio.wav
   */
  audio?: {
    voice?: string;
    format?: string;
    bitrate?: string;
    speed?: number;
  };

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    (arg: string) => Promise<string>
  >;
};
