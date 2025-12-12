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
