import type { TestCase } from '../../../src/types';
import { loadTestsFromGlob } from '../../../src/util/testCaseReader';

jest.mock('../../../src/integrations/huggingfaceDatasets', () => ({
  fetchHuggingFaceDataset: jest.fn(),
}));

describe('Test Case Reader - Glob Pattern Loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads test cases from HuggingFace dataset URLs', async () => {
    const mockDataset: TestCase[] = [
      {
        description: 'Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
      {
        description: 'Test 2',
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
        options: {},
      },
    ];
    const mockFetchHuggingFaceDataset = jest.requireMock(
      '../../../src/integrations/huggingfaceDatasets',
    ).fetchHuggingFaceDataset;
    mockFetchHuggingFaceDataset.mockImplementation(async () => mockDataset);

    const result = await loadTestsFromGlob('huggingface://datasets/example/dataset');

    expect(mockFetchHuggingFaceDataset).toHaveBeenCalledWith(
      'huggingface://datasets/example/dataset',
    );
    expect(result).toEqual(mockDataset);
  });
});
