import fetch from 'node-fetch';

import type { ApiProvider, ProviderEmbeddingResponse, ProviderResponse } from '../types.js';

interface HuggingfaceTextGenerationOptions {
  top_k?: number;
  top_p?: number;
  temperature?: number;
  repetition_penalty?: number;
  max_new_tokens?: number;
  max_time?: number;
  return_full_text?: boolean;
  num_return_sequences?: number;
  do_sample?: boolean;
  use_cache?: boolean;
  wait_for_model?: boolean;
}

export class HuggingfaceTextGenerationProvider implements ApiProvider {
  modelName: string;
  config: HuggingfaceTextGenerationOptions;

  constructor(modelName: string, options: { id?: string, config?: HuggingfaceTextGenerationOptions } = {}) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `huggingface:text-generation:${this.modelName}`;
  }

  toString(): string {
    return `[Huggingface Text Generation Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params = {
      inputs: prompt,
      parameters: {
        return_full_text: this.config.return_full_text ?? false,
        ...this.config
      },
    };

    const response = await fetch(`https://api-inference.huggingface.co/models/${this.modelName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.HF_API_TOKEN}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      try {
        const json = await response.json();
        return {
          error: `API call error: ${json.error}\nHTTP ${response.status} ${response.statusText}`,
        };
      } catch {
        return {
          error: `API call error: ${response.status} ${response.statusText}`,
        };
      }
    }

    const data = await response.json();
    return {
      output: data[0]?.generated_text,
    };
  }
}

interface HuggingfaceFeatureExtractionOptions {
  use_cache?: boolean;
  wait_for_model?: boolean;
}

export class HuggingfaceFeatureExtractionProvider implements ApiProvider {
   modelName: string;
   config: HuggingfaceFeatureExtractionOptions;

   constructor(modelName: string, options: { id?: string, config?: HuggingfaceFeatureExtractionOptions } = {}) {
     const { id, config } = options;
     this.modelName = modelName;
     this.id = id ? () => id : this.id;
     this.config = config || {};
   }

   id(): string {
     return `huggingface:feature-extraction:${this.modelName}`;
   }

   toString(): string {
     return `[Huggingface Feature Extraction Provider ${this.modelName}]`;
   }

   async callApi(): Promise<ProviderResponse> {
     throw new Error('Cannot use a feature extraction provider for text generation');
   }

   async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
     const params = {
       inputs: text,
     };

     const response = await fetch(`https://api-inference.huggingface.co/models/${this.modelName}`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${process.env.HF_API_TOKEN}`,
       },
       body: JSON.stringify(params),
     });

     if (!response.ok) {
       try {
         const json = await response.json();
         return {
           error: `API call error: ${json.error}\nHTTP ${response.status} ${response.statusText}`,
         };
       } catch {
         return {
           error: `API call error: ${response.status} ${response.statusText}`,
         };
       }
     }

     const data = await response.json();
     return {
       embedding: data,
     };
   }
 }
