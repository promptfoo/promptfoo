import request from 'supertest';
import * as httpProvider from '../../src/providers/http';
import { createApp } from '../../src/server/server';
import { createMockResponse } from '../util/utils';

describe('providersRouter', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('should parse and load the provider with JSON body', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'Mocked response' });
    jest.spyOn(httpProvider.HttpProvider.prototype, 'callApi').mockImplementation(mockCallApi);
    jest.mocked(fetch).mockResolvedValue(
      createMockResponse({
        json: jest.fn().mockResolvedValue({
          changes_needed: true,
          changes_needed_reason: 'Test reason',
          changes_needed_suggestions: ['Test suggestion 1', 'Test suggestion 2'],
        }),
      }),
    );

    const testProvider = {
      id: 'http://example.com/api',
      config: {
        url: 'http://example.com/api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
      },
    };

    const res = await request(app).post('/api/providers/test').send(testProvider);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      providerResponse: {
        output: 'Mocked response',
      },
      testResult: {
        changes_needed: true,
        changes_needed_reason: 'Test reason',
        changes_needed_suggestions: ['Test suggestion 1', 'Test suggestion 2'],
      },
    });
  });

  it('should parse and load the provider with YAML body', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'Mocked response' });
    jest.spyOn(httpProvider.HttpProvider.prototype, 'callApi').mockImplementation(mockCallApi);
    jest.mocked(fetch).mockResolvedValue(
      createMockResponse({
        json: jest.fn().mockResolvedValue({
          changes_needed: false,
        }),
      }),
    );

    const testProvider = {
      id: 'http://example.com/api',
      config: {
        url: 'http://example.com/api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: `
          messages:
            - role: user
              content: "{{ prompt }}"
        `,
      },
    };

    const res = await request(app).post('/api/providers/test').send(testProvider);

    expect(res.status).toBe(200);
    expect(res.body.providerResponse.output).toBe('Mocked response');
    expect(mockCallApi).toHaveBeenCalledWith('Hello, world!', expect.any(Object));
  });

  it('should validate provider config using Zod schema', async () => {
    const invalidProvider = {
      id: 'http://example.com/api',
      config: {
        // Missing required url field
        method: 'POST',
        headers: { 'invalid-header': 123 }, // Invalid header value type
      },
    };

    const res = await request(app).post('/api/providers/test').send(invalidProvider);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should handle non-JSON content types correctly', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'Mocked response' });
    jest.spyOn(httpProvider.HttpProvider.prototype, 'callApi').mockImplementation(mockCallApi);
    jest.mocked(fetch).mockResolvedValue(
      createMockResponse({
        json: jest.fn().mockResolvedValue({
          changes_needed: false,
        }),
      }),
    );

    const testProvider = {
      id: 'http://example.com/api',
      config: {
        url: 'http://example.com/api',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'Raw text body with {{ prompt }}',
      },
    };

    const res = await request(app).post('/api/providers/test').send(testProvider);

    expect(res.status).toBe(200);
    expect(res.body.providerResponse.output).toBe('Mocked response');
  });
});
