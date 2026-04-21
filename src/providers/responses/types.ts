import type { FunctionCallbackHandler } from '../functionCallbackUtils';

export interface ProcessorConfig {
  modelName: string;
  providerType: 'openai' | 'azure' | 'xai';
  functionCallbackHandler: FunctionCallbackHandler;
  costCalculator: (modelName: string, usage: any, config?: any) => number;
}

export interface ProcessorContext {
  config: any;
  cached: boolean;
  data: any;
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
}
