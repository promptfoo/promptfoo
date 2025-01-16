import request from 'supertest';
import { createApp } from '../../src/server/server';
import { mockCloudConfig, resetMockCloudConfig } from '../__mocks__/src/globalConfig/cloud';

const mockedFetch = jest.mocked(jest.fn());
global.fetch = mockedFetch;

jest.mock('../../src/globalConfig/cloud');

describe('/api/remote-health endpoint', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetMockCloudConfig();
    delete process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION;
    delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
    app = createApp();
  });

  it('should return disabled status when remote generation is disabled', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    const response = await request(app).get('/api/remote-health').expect(200);

    expect(response.body).toEqual({
      status: 'DISABLED',
      message: 'remote generation and grading are disabled',
    });
  });

  it('should return health check result when enabled', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'OK' }),
    } as Response);

    const response = await request(app).get('/api/remote-health').expect(200);

    expect(response.body).toEqual({
      status: 'OK',
      message: 'Cloud API is healthy',
    });
  });

  it('should handle errors from health check', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('Network error'));

    const response = await request(app).get('/api/remote-health').expect(200);

    expect(response.body).toEqual({
      status: 'ERROR',
      message: expect.stringContaining('Network error'),
    });
  });

  it('should use custom URL from environment', async () => {
    process.env.PROMPTFOO_REMOTE_GENERATION_URL = 'https://custom-api.example.com/task';
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'OK' }),
    } as Response);

    await request(app).get('/api/remote-health').expect(200);

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://custom-api.example.com/health',
      expect.any(Object),
    );
  });

  it('should use cloud config URL when enabled', async () => {
    mockConfig.isEnabled = true;
    mockConfig.apiHost = 'https://cloud.example.com';
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'OK' }),
    } as Response);

    await request(app).get('/api/remote-health').expect(200);

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/health',
      expect.any(Object),
    );
  });
});
