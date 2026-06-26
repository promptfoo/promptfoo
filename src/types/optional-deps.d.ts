// istextorbinary has types but exports field doesn't support bundler resolution
declare module 'istextorbinary' {
  export function isText(filename?: string | null, buffer?: Buffer | null): boolean | null;
  export function isBinary(filename?: string | null, buffer?: Buffer | null): boolean | null;
  export function getEncoding(
    buffer: Buffer,
    opts?: { chunkLength?: number; chunkBegin?: number },
  ): 'utf8' | 'binary' | null;
}

declare module '@ibm-cloud/watsonx-ai' {
  export interface WatsonXAI {
    newInstance(config: any): any;
    generateText(params: any): Promise<any>;
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

// Optional libSQL node client used through lazy imports in database helpers.
declare module '@libsql/client/node' {
  export interface Client {
    execute(...args: any[]): Promise<any>;
    batch(...args: any[]): Promise<any>;
    migrate(...args: any[]): Promise<any>;
    executeMultiple(...args: any[]): Promise<any>;
    close(): void | Promise<void>;
  }

  export function createClient(config: { url: string }): Client;
}
