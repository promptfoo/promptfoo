import type { AzureModelCost } from './types';

export const DEFAULT_AZURE_API_VERSION = '2024-12-01-preview';

export const AZURE_MODELS: AzureModelCost[] = [
  // GPT-4.1 models
  {
    id: 'gpt-4.1-2025-04-14',
    cost: {
      input: 2 / 1000000,
      output: 8 / 1000000,
    },
  },
  // o1 reasoning models
  {
    id: 'o1-2024-12-17',
    cost: {
      input: 15 / 1000000,
      output: 60 / 1000000,
    },
  },
  {
    id: 'o1-preview-2024-09-12',
    cost: {
      input: 15 / 1000000,
      output: 60 / 1000000,
    },
  },
  // o3 mini models
  {
    id: 'o3-mini-2025-01-31',
    cost: {
      input: 1.1 / 1000000,
      output: 4.4 / 1000000,
    },
  },
  {
    id: 'o1-mini-2024-09-12',
    cost: {
      input: 1.1 / 1000000,
      output: 4.4 / 1000000,
    },
  },
  // GPT-4o Realtime models (text only pricing)
  {
    id: 'gpt-4o-realtime-preview-2024-12-17',
    cost: {
      input: 5 / 1000000,
      output: 20 / 1000000,
    },
  },
  {
    id: 'gpt-4o-mini-realtime-preview-2024-12-17',
    cost: {
      input: 0.6 / 1000000,
      output: 2.4 / 1000000,
    },
  },
  // GPT-4o Audio models (text only pricing)
  {
    id: 'gpt-4o-audio-preview-2024-12-17',
    cost: {
      input: 2.5 / 1000000,
      output: 10 / 1000000,
    },
  },
  {
    id: 'gpt-4o-mini-audio-preview-2024-12-17',
    cost: {
      input: 0.15 / 1000000,
      output: 0.6 / 1000000,
    },
  },
  // Updated GPT-4o models
  {
    id: 'gpt-4o-2024-1120',
    cost: {
      input: 2.5 / 1000000,
      output: 10 / 1000000,
    },
  },
  {
    id: 'gpt-4o-2024-08-06',
    cost: {
      input: 2.5 / 1000000,
      output: 10 / 1000000,
    },
  },
  {
    id: 'gpt-4o-2024-0513',
    cost: {
      input: 5 / 1000000,
      output: 15 / 1000000,
    },
  },
  {
    id: 'gpt-4o-mini-0718',
    cost: {
      input: 0.15 / 1000000,
      output: 0.6 / 1000000,
    },
  },
  {
    id: 'gpt-4o',
    cost: {
      input: 5 / 1000000,
      output: 15 / 1000000,
    },
  },
  {
    id: 'gpt-4o-mini',
    cost: {
      input: 0.15 / 1000000,
      output: 0.6 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-0125',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-instruct',
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'gpt-4',
    cost: {
      input: 30 / 1000000,
      output: 60 / 1000000,
    },
  },
  {
    id: 'gpt-4-32k',
    cost: {
      input: 60 / 1000000,
      output: 120 / 1000000,
    },
  },
  {
    id: 'babbage-002',
    cost: {
      input: 0.4 / 1000000,
      output: 0.4 / 1000000,
    },
  },
  {
    id: 'davinci-002',
    cost: {
      input: 2 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'text-embedding-ada-002',
    cost: {
      input: 0.1 / 1000000,
      output: 0.1 / 1000000,
    },
  },
  {
    id: 'text-embedding-3-large',
    cost: {
      input: 0.13 / 1000000,
      output: 0.13 / 1000000,
    },
  },
  {
    id: 'text-embedding-3-small',
    cost: {
      input: 0.02 / 1000000,
      output: 0.02 / 1000000,
    },
  },
  // Legacy models
  {
    id: 'gpt-3.5-turbo-0301',
    cost: {
      input: 2 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-0613',
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-1106',
    cost: {
      input: 1 / 1000000,
      output: 2 / 1000000,
    },
  },
  // More legacy models from pricing sheet
  {
    id: 'gpt-4-turbo',
    cost: {
      input: 10 / 1000000,
      output: 30 / 1000000,
    },
  },
  {
    id: 'gpt-4-turbo-vision',
    cost: {
      input: 10 / 1000000,
      output: 30 / 1000000,
    },
  },
];
