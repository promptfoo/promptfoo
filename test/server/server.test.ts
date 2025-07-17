import request from 'supertest';
import { createApp } from '../../src/server/server';

const mockedFetch = jest.mocked(jest.fn());
global.fetch = mockedFetch;

jest.mock('../../src/util/database', () => ({
  getStandaloneEvals: jest.fn().mockImplementation(async (opts) => {
    if (opts?.tag?.key === 'test' && opts?.tag?.value === 'value') {
      return [{ id: '1', description: 'Test eval' }];
    }
    if (opts?.description === 'search') {
      return [{ id: '2', description: 'search' }];
    }
    return [];
  }),
}));

describe('/api/history endpoint', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  it('should return results filtered by tag', async () => {
    const response = await request(app)
      .get('/api/history')
      .query({ tagName: 'test', tagValue: 'value' })
      .expect(200);

    expect(response.body.data).toEqual([{ id: '1', description: 'Test eval' }]);
  });

  it('should return results filtered by description', async () => {
    const response = await request(app)
      .get('/api/history')
      .query({ description: 'search' })
      .expect(200);

    expect(response.body.data).toEqual([{ id: '2', description: 'search' }]);
  });

  it('should return empty array when no matches found', async () => {
    const response = await request(app)
      .get('/api/history')
      .query({ tagName: 'nonexistent', tagValue: 'value' })
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should handle missing query parameters', async () => {
    const response = await request(app).get('/api/history').expect(200);

    expect(response.body.data).toEqual([]);
  });
});
