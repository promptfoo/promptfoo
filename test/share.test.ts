import type EvalResult from 'src/models/evalResult';
import { getUserEmail } from '../src/globalConfig/accounts';
import { cloudConfig } from '../src/globalConfig/cloud';
import type Eval from '../src/models/eval';
import { stripAuthFromUrl, createShareableUrl } from '../src/share';
import { cloudCanAcceptChunkedResults } from '../src/util/cloud';

const mockFetch = jest.fn();

jest.mock('../src/globalConfig/cloud');
jest.mock('../src/fetch', () => ({
  fetchWithProxy: jest.fn().mockImplementation((...args) => mockFetch(...args)),
}));

jest.mock('../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(),
  setUserEmail: jest.fn(),
  getAuthor: jest.fn().mockReturnValue('test-author@example.com'),
}));

jest.mock('../src/util/cloud', () => ({
  cloudCanAcceptChunkedResults: jest.fn(),
}));

describe('stripAuthFromUrl', () => {
  it('removes username and password from URL', () => {
    const input = 'https://user:pass@example.com/path?query=value#hash';
    const expected = 'https://example.com/path?query=value#hash';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('handles URLs without auth info', () => {
    const input = 'https://example.com/path?query=value#hash';
    expect(stripAuthFromUrl(input)).toBe(input);
  });

  it('handles URLs with only username', () => {
    const input = 'https://user@example.com/path';
    const expected = 'https://example.com/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('handles URLs with special characters in auth', () => {
    const input = 'https://user%40:p@ss@example.com/path';
    const expected = 'https://example.com/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('returns original string for invalid URLs', () => {
    const input = 'not a valid url';
    expect(stripAuthFromUrl(input)).toBe(input);
  });

  it('handles URLs with IP addresses', () => {
    const input = 'http://user:pass@192.168.1.1:8080/path';
    const expected = 'http://192.168.1.1:8080/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });
});

describe('createShareableUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'mock-eval-id' }),
    });
  });

  it('creates correct URL for cloud config and updates author', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    jest.mocked(getUserEmail).mockReturnValue('logged-in@example.com');

    const mockEval: Partial<Eval> = {
      config: {},
      author: 'original@example.com',
      useOldResults: jest.fn().mockReturnValue(false),
      loadResults: jest.fn().mockResolvedValue(undefined),
      results: [{ id: '1' }, { id: '2' }] as EvalResult[],
      save: jest.fn().mockResolvedValue(undefined),
      toEvaluateSummary: jest.fn().mockResolvedValue({}),
      getTable: jest.fn().mockResolvedValue([]),
    };

    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBe('https://app.example.com/eval/mock-eval-id');
  });

  describe('chunked vs regular sending', () => {
    let mockEval: Partial<Eval>;

    beforeEach(() => {
      mockEval = {
        config: {},
        author: 'test@example.com',
        useOldResults: jest.fn().mockReturnValue(false),
        loadResults: jest.fn().mockResolvedValue(undefined),
        results: [{ id: '1' }, { id: '2' }] as EvalResult[],
        save: jest.fn().mockResolvedValue(undefined),
        toEvaluateSummary: jest.fn().mockResolvedValue({}),
        getTable: jest.fn().mockResolvedValue([]),
      };

      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');

      // Reset fetch mock between tests
      mockFetch.mockReset();
    });

    it('sends regular eval when cloud build date is older than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudCanAcceptChunkedResults).mockResolvedValue(false);

      // Mock successful response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      });

      await createShareableUrl(mockEval as Eval);

      // Verify sendEvalResults was used (not chunked)
      expect(mockEval.loadResults).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[{"id":"1"},{"id":"2"}]'),
        }),
      );
    });

    it('sends chunked eval when cloud build date is newer than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudCanAcceptChunkedResults).mockResolvedValue(true);

      // Mock successful responses for initial request and chunk
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'mock-eval-id' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      await createShareableUrl(mockEval as Eval);

      // Verify chunks were sent
      expect(mockEval.loadResults).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[]'),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/results/mock-eval-id/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[{"id":"1"},{"id":"2"}]'),
        }),
      );
    });

    it('sends regular eval when open source version is older than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

      // Mock both the health check and eval submission responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.7' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.7' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'mock-eval-id' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const result = await createShareableUrl(mockEval as Eval);

      // Verify sendEvalResults was used (not chunked)
      // expect(mockEval.loadResults).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/eval'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[{"id":"1"},{"id":"2"}]'),
        }),
      );
      expect(result).toBe('https://app.promptfoo.dev/eval/mock-eval-id');
    });

    it('sends chunked eval when open source version is newer than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

      // Mock health check, initial eval submission, and chunk submission responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.9' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.9' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'mock-eval-id' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const result = await createShareableUrl(mockEval as Eval);

      // Verify chunks were sent
      // expect(mockEval.loadResults).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/eval'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[]'),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/eval\/mock-eval-id\/results/),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[{"id":"1"},{"id":"2"}]'),
        }),
      );
      expect(result).toBe('https://app.promptfoo.dev/eval/mock-eval-id');
    });
  });
});
