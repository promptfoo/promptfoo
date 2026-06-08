import type { FunctionCallbackHandler } from '../functionCallbackUtils';

type ProcessedReasoningContent =
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'reasoning'; content: string }
  | { type: 'thought'; thought: string; signature?: string }
  | { type: 'think'; content: string };

export interface ProcessorConfig {
  modelName: string;
  providerType: 'openai' | 'azure' | 'xai';
  functionCallbackHandler: FunctionCallbackHandler;
  costCalculator: (modelName: string, usage: any, config?: any) => number | undefined;
}

export interface ProcessorContext {
  config: any;
  cached: boolean;
  data: any;
  suppressReasoningOutput?: boolean;
}

export interface ResponseProcessingOptions {
  suppressReasoningOutput?: boolean;
}

export interface ResponseOutputItem {
  type: string;
  [key: string]: any;
}

export interface ProcessedOutput {
  result: string;
  refusal: string;
  isRefusal: boolean;
  annotations?: any[];
  reasoning?: ProcessedReasoningContent[];
}
