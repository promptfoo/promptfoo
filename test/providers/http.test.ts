import { HttpProvider } from '../../src/providers/http';

jest.mock('../../src/cache', () => ({
  ...jest.requireActual('../../src/cache'),
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/fetch', () => ({
  ...jest.requireActual('../../src/fetch'),
  fetchWithRetries: jest.fn(),
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  maybeLoadFromExternalFile: jest.fn((input) => input),
}));

jest.mock('../../src/esm', () => ({
  importModule: jest.fn(async (modulePath: string, functionName?: string) => {
    const mockModule = {
      default: jest.fn((data) => data.defaultField),
      parseResponse: jest.fn((data) => data.specificField),
    };
    if (functionName) {
      return mockModule[functionName as keyof typeof mockModule];
    }
    return mockModule;
  }),
}));

jest.mock('../../src/cliState', () => ({
  basePath: '/mock/base/path',
}));

jest.mock('../../src/logger');

describe('HttpProvider', () => {
  const mockUrl = 'http://example.com/api';
  let _provider: HttpProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getHeaders', () => {
    it('should combine default headers with config headers', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          headers: { 'X-Custom': '{{ prompt }}' },
          body: 'test',
        },
      });
      const result = await provider['getHeaders'](
        { 'content-type': 'application/json' },
        { prompt: 'test' },
      );
      expect(result).toEqual({
        'content-type': 'application/json',
        'x-custom': 'test',
      });
    });

    it('should render template strings in headers', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          headers: { 'X-Custom': '{{ prompt | upper }}' },
          body: 'test',
        },
      });
      const result = await provider['getHeaders']({}, { prompt: 'test' });
      expect(result).toEqual({
        'x-custom': 'TEST',
      });
    });
  });
});
