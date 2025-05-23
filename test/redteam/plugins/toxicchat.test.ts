import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import {
  ToxicChatPlugin,
  ToxicChatGrader,
  fetchDataset,
  PLUGIN_ID,
} from '../../../src/redteam/plugins/toxicchat';
import type { TestCase } from '../../../src/types';

jest.mock('../../../src/integrations/huggingfaceDatasets');

describe('ToxicChatPlugin', () => {
  it('should set canGenerateRemote to false', () => {
    expect(ToxicChatPlugin.canGenerateRemote).toBe(false);
  });
});

describe('ToxicChatGrader', () => {
  it('should have the correct plugin ID', () => {
    const grader = new ToxicChatGrader();
    expect(grader.id).toBe(PLUGIN_ID);
  });
});

describe('fetchDataset', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch and filter toxic prompts', async () => {
    const mock: TestCase[] = [
      { vars: { user_input: 'hi', toxicity: 1, jailbreaking: 0 } },
      { vars: { user_input: 'ok', toxicity: 0, jailbreaking: 0 } },
      { vars: { user_input: 'hack', jailbreaking: 1 } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);
    const res = await fetchDataset(2);
    expect(res.length).toBeLessThanOrEqual(2);
    res.forEach((t) => {
      expect(t.vars).toHaveProperty('prompt');
    });
  });

  it('should handle fetch errors', async () => {
    jest.mocked(fetchHuggingFaceDataset).mockRejectedValue(new Error('fail'));
    const res = await fetchDataset(3);
    expect(res).toEqual([]);
  });
});
