import {
  DATASET_URL,
  DATASET_URL_MULTILINGUAL,
  fetchDataset,
} from '../../../src/redteam/plugins/cyberseceval';

describe('fetchDataset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and process dataset successfully', async () => {
    const mockData = [
      {
        test_case_prompt: 'Test prompt 1',
        user_input: 'User input 1',
        judge_question: 'Judge question 1',
        injection_type: 'type1',
        injection_variant: 'variant1',
        risk_category: 'low',
        speaking_language: 'en',
      },
      {
        test_case_prompt: 'Test prompt 2',
        user_input: 'User input 2',
        judge_question: 'Judge question 2',
        injection_type: 'type2',
        injection_variant: 'variant2',
        risk_category: 'medium',
        speaking_language: 'en',
      },
    ];

    const mockResponse = {
      ok: true,
      json: async () => mockData,
    };

    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const result = await fetchDataset(1, false);

    expect(global.fetch).toHaveBeenCalledWith(DATASET_URL, expect.any(Object));
    expect(result).toHaveLength(1);
    expect(result[0].vars).toEqual({
      test_case_prompt: expect.any(String),
      user_input: expect.any(String),
      judge_question: expect.any(String),
    });
  });

  it('should fetch multilingual dataset when isMultilingual is true', async () => {
    const mockData = [
      {
        test_case_prompt: 'Test prompt',
        user_input: 'User input',
        judge_question: 'Judge question',
        injection_type: 'type1',
        injection_variant: 'variant1',
        risk_category: 'low',
        speaking_language: 'es',
      },
    ];

    const mockResponse = {
      ok: true,
      json: async () => mockData,
    };

    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    await fetchDataset(1, true);

    expect(global.fetch).toHaveBeenCalledWith(DATASET_URL_MULTILINGUAL, expect.any(Object));
  });

  it('should handle HTTP error response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
    };

    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const result = await fetchDataset(1, false);

    expect(result).toEqual([]);
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => 'invalid data',
    };

    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const result = await fetchDataset(1, false);

    expect(result).toEqual([]);
  });

  it('should handle network error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchDataset(1, false);

    expect(result).toEqual([]);
  });

  it('should limit number of test cases to specified limit', async () => {
    const mockData = Array(10).fill({
      test_case_prompt: 'Test prompt',
      user_input: 'User input',
      judge_question: 'Judge question',
      injection_type: 'type1',
      injection_variant: 'variant1',
      risk_category: 'low',
      speaking_language: 'en',
    });

    const mockResponse = {
      ok: true,
      json: async () => mockData,
    };

    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const limit = 5;
    const result = await fetchDataset(limit, false);

    expect(result).toHaveLength(limit);
  });

  it('should handle empty dataset response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => [],
    };

    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const result = await fetchDataset(1, false);

    expect(result).toEqual([]);
  });
});
