import type express from 'express';
import type { Server } from 'http';
import request from 'supertest';
import { CloudConfig } from '../../src/globalConfig/cloud';
import { createApp } from '../../src/server/server';

const mockedFetch = jest.mocked(jest.fn());
global.fetch = mockedFetch;

// Create a complete mock implementation of CloudConfig
class MockCloudConfig extends CloudConfig {
  constructor(private isEnabledValue: boolean = false) {
    super();
    this.setApiHost('https://custom.api.com');
  }

  isEnabled = jest.fn().mockImplementation(() => this.isEnabledValue);
  getApiHost = jest.fn().mockReturnValue('https://custom.api.com');
}

// Mock CloudConfig
jest.mock('../../src/globalConfig/cloud', () => ({
  CloudConfig: jest.fn().mockImplementation((isEnabled = false) => new MockCloudConfig(isEnabled)),
}));

describe('Remote Health Endpoint', () => {
  let app: express.Application;
  let server: Server;

  beforeAll(() => {
    app = createApp();
    server = app.listen();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should return OK status when API is healthy', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'OK2' }),
      headers: new Headers(),
      redirected: false,
      status: 200,
      statusText: 'OK',
      type: 'basic',
      url: '',
      clone: () => ({} as Response),
      body: null,
      bodyUsed: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      text: async () => '',
    } as Response);

    const response = await request(app).get('/api/remote-health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'OK',
      message: 'Cloud API is healthy',
    });
  });

  it('should include custom endpoint message when CloudConfig is enabled', async () => {
    jest.mocked(CloudConfig).mockImplementationOnce(() => new MockCloudConfig(true));

    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'OK2' }),
      headers: new Headers(),
      redirected: false,
      status: 200,
      statusText: 'OK',
      type: 'basic',
      url: '',
      clone: () => ({} as Response),
      body: null,
      bodyUsed: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      text: async () => '',
    } as Response);

    const response = await request(app).get('/api/remote-health');

    expect(response.body.message).toBe('Cloud API is healthy (using custom endpoint)');
  });

  it('should return error status when API request fails', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: '',
      clone: () => ({} as Response),
      body: null,
      bodyUsed: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      text: async () => '',
      json: async () => ({}),
    } as Response);

    const response = await request(app).get('/api/remote-health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'ERROR',
      message: expect.stringContaining('Failed to connect to'),
    });
  });

  it('should handle network errors', async () => {
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

    const response = await request(app).get('/api/remote-health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'ERROR',
      message: expect.stringContaining('Network error'),
    });
  });

  // Additional test cases
  it('should handle API returning non-OK2 status', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ERROR' }),
      headers: new Headers(),
      redirected: false,
      status: 200,
      statusText: 'OK',
      type: 'basic',
      url: '',
      clone: () => ({} as Response),
      body: null,
      bodyUsed: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      text: async () => '',
    } as Response);

    const response = await request(app).get('/api/remote-health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'ERROR',
      message: expect.stringContaining('responded with an error status'),
    });
  });

  it('should handle malformed JSON response', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
      headers: new Headers(),
      redirected: false,
      status: 200,
      statusText: 'OK',
      type: 'basic',
      url: '',
      clone: () => ({} as Response),
      body: null,
      bodyUsed: false,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      text: async () => '',
    } as Response);

    const response = await request(app).get('/api/remote-health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'ERROR',
      message: expect.stringContaining('Invalid JSON'),
    });
  });
});
