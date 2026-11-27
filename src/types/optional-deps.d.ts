declare module '@ibm-cloud/watsonx-ai' {
  export interface WatsonXAI {
    newInstance(config: any): any;
    generateText(params: any): Promise<any>;
    listFoundationModelSpecs(params?: { filters?: string; signal?: AbortSignal }): Promise<{
      result: {
        resources?: Array<{
          model_id: string;
          input_tier?: string;
          output_tier?: string;
        }>;
      };
    }>;
  }
  export const WatsonXAI: {
    newInstance(config: any): any;
  };
}

declare module 'ibm-cloud-sdk-core' {
  export class IamAuthenticator {
    constructor(config: { apikey: string });
  }
  export class BearerTokenAuthenticator {
    constructor(config: { bearerToken: string });
  }
}

// Optional dependency used by transformers providers through dynamic imports.
declare module '@huggingface/transformers';

// Optional peer dependency, imported lazily by the HTTP provider only when JKS
// signature auth or mTLS is configured, and cast at the use site.
declare module 'jks-js';
