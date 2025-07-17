import request from 'supertest';
import type { Express } from 'express';
import * as httpProvider from '../../src/providers/http';
import { createApp } from '../../src/server/server';
import { createMockResponse } from '../util/utils';

// Mock database dependencies
jest.mock('../../src/migrate', () => ({
  runDbMigrations: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
  closeDb: jest.fn(),
}));

describe('providersRouter', () => {
  let app: Express;
  const originalFetch = global.fetch;
  let httpProviderSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a fresh app instance for each test
    app = createApp();
    // Mock global fetch
    global.fetch = jest.fn() as unknown as typeof fetch;
    // Create spy for HttpProvider
    httpProviderSpy = jest.spyOn(httpProvider.HttpProvider.prototype, 'callApi');
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    // Restore HttpProvider spy
    if (httpProviderSpy) {
      httpProviderSpy.mockRestore();
    }
    // Clear all mocks
    jest.restoreAllMocks();
    // Clear any remaining jest mocks
    jest.clearAllMocks();
  });

  it('should parse and load the provider with JSON body', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'Mocked response' });
    httpProviderSpy.mockImplementation(mockCallApi);

    // Mock the external API call comprehensively
    jest.mocked(fetch).mockResolvedValue(
      createMockResponse({
        ok: true,
        status: 200,
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
    httpProviderSpy.mockImplementation(mockCallApi);
    jest.mocked(fetch).mockResolvedValue(
      createMockResponse({
        ok: true,
        status: 200,
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

  it('should handle non-JSON content types correctly', async () => {
    const mockCallApi = jest.fn().mockResolvedValue({ output: 'Mocked response' });
    httpProviderSpy.mockImplementation(mockCallApi);
    jest.mocked(fetch).mockResolvedValue(
      createMockResponse({
        ok: true,
        status: 200,
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
