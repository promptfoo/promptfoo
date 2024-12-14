import type { ApiProvider, ProviderResponse } from '../../src/types';

export class TestGrader implements ApiProvider {
  async callApi(): Promise<ProviderResponse> {
    return {
      output: JSON.stringify({ pass: true, reason: 'Test grading output' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    };
  }

  id(): string {
    return 'TestGradingProvider';
  }
}

export function createMockResponse(options: Partial<Response> = {}): Response {
  const mockResponse: Response = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: 'https://example.com',
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
    bodyUsed: false,
    body: null,
    clone() {
      return createMockResponse(this);
    },
    ...options,
  } as Response;
  return mockResponse;
}
