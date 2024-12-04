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

  it('should parse and load the provider, then call callApi', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'Mocked response' });
    jest.spyOn(httpProvider.HttpProvider.prototype, 'callApi').mockImplementation(mockCallApi);
    jest.mocked(fetch).mockResolvedValue(
      createMockResponse({
        json: jest.fn().mockResolvedValue({
          changes_needed: true,
          changes_needed_reason: 'Test reason',
          changes_needed_suggestions: ['Test suggestion 1', 'Test suggestion 2'],
        }),
        ok: true,
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'http://example.com',
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: jest.fn(),
        blob: jest.fn(),
        formData: jest.fn(),
        text: jest.fn(),
      }) as Response,
    );
    const testProvider = {
      id: 'http://example.com/api',
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
      },
    };

    const res = await request(app).post('/api/providers/test').send(testProvider);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider_response: {
        output: 'Mocked response',
      },
      test_result: {
        changes_needed: true,
        changes_needed_reason: 'Test reason',
        changes_needed_suggestions: ['Test suggestion 1', 'Test suggestion 2'],
      },
    });

    // Update this expectation to match the actual arguments
    expect(mockCallApi).toHaveBeenCalledWith('Hello, world!', {
      debug: true,
      prompt: {
        label: 'Hello, world!',
        raw: 'Hello, world!',
      },
      vars: expect.any(Object),
    });
  });

  it('should return 400 for invalid provider schema', async () => {
    const invalidProvider = {
      type: 'invalid',
      url: 'http://example.com/api',
    };

    const res = await request(app).post('/api/providers/test').send(invalidProvider);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
