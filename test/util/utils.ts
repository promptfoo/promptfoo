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

export function createMockResponse(
  options: {
    ok?: boolean;
    body?: any;
    statusText?: string;
    status?: number;
    headers?: Headers;
    text?: () => Promise<string>;
    json?: () => Promise<any>;
  } = { ok: true },
): Response {
  const isOk = options.ok ?? (options.status ? options.status < 400 : true);
  const mockResponse: Response = {
    ok: isOk,
    status: options.status || (isOk ? 200 : 400),
    statusText: options.statusText || (isOk ? 'OK' : 'Bad Request'),
    headers: options.headers || new Headers(),
    redirected: false,
    type: 'basic',
    url: 'https://example.com',
    json: options.json || (() => Promise.resolve(options.body || {})),
    text: options.text || (() => Promise.resolve('')),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    bodyUsed: false,
    body: null,
    clone() {
      return createMockResponse(options);
    },
  } as Response;
  return mockResponse;
}
