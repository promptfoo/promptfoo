import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import {
  AegisGrader,
  AegisPlugin,
  PLUGIN_ID,
  fetchDataset,
} from '../../../src/redteam/plugins/aegis';
import type { TestCase } from '../../../src/types';

jest.mock('../../../src/integrations/huggingfaceDatasets');

describe('AegisPlugin', () => {
  it('should set canGenerateRemote to false', () => {
    expect(AegisPlugin.canGenerateRemote).toBe(false);
  });
});

describe('fetchDataset', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch and filter dataset', async () => {
    const mockTestCases: TestCase[] = [
      { vars: { text: 'hello', text_type: 'user_message', labels_0: 'Safe' } },
      { vars: { text: 'ignore me', text_type: 'llm_response' } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchDataset(1);
    expect(fetchHuggingFaceDataset).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].vars?.text).toBe('hello');
  });

  it('should handle errors', async () => {
    jest.mocked(fetchHuggingFaceDataset).mockRejectedValue(new Error('fail'));
    const result = await fetchDataset(2);
    expect(result).toEqual([]);
  });
});

describe('AegisGrader', () => {
  it('should have correct ID', () => {
    const grader = new AegisGrader();
    expect(grader.id).toBe(PLUGIN_ID);
  });
});
