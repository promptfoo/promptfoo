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
