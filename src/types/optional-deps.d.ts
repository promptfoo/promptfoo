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

// @huggingface/transformers ships with types, but they use complex generics that produce
// "union type too complex" errors when used with dynamic string task names.
// These simplified declarations allow dynamic usage without type errors.
declare module '@huggingface/transformers' {
  export type ProgressCallback = (progress: {
    status: string;
    file?: string;
    progress?: number;
    model?: string;
  }) => void;

  export interface PipelineOptions {
    progress_callback?: ProgressCallback;
    device?: string;
    dtype?: string;
    cache_dir?: string;
    local_files_only?: boolean;
    revision?: string;
    session_options?: Record<string, unknown>;
  }

  export interface Pipeline {
    (input: string | string[], options?: Record<string, unknown>): Promise<unknown>;
    dispose?: () => Promise<void>;
  }

  export function pipeline(
    task: string,
    model: string,
    options?: PipelineOptions,
  ): Promise<Pipeline>;
}
