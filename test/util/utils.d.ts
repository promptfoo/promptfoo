import type { ApiProvider, ProviderResponse } from '../../src/types';
export declare class TestGrader implements ApiProvider {
    callApi(): Promise<ProviderResponse>;
    id(): string;
}
export declare function createMockResponse(options?: {
    ok?: boolean;
    body?: any;
    statusText?: string;
    status?: number;
    headers?: Headers;
    text?: () => Promise<string>;
    json?: () => Promise<any>;
}): Response;
//# sourceMappingURL=utils.d.ts.map