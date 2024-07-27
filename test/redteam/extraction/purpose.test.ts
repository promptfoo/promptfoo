import {
  SystemPurposeExtractor,
  extractSystemPurpose,
} from '../../../src/redteam/extraction/purpose';
import { ApiProvider } from '../../../src/types';

// Mock the logger
jest.mock('../../../src/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('SystemPurposeExtractor', () => {
  let provider: ApiProvider;
  let extractor: SystemPurposeExtractor;

  beforeEach(() => {
    provider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Analyze medical images for anomalies' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    extractor = new SystemPurposeExtractor(provider);
    jest.clearAllMocks();
  });

  it('should generate the correct prompt', () => {
    const prompts = ['Prompt 1', 'Prompt 2'];
    const generatedPrompt = extractor['generatePrompt'](prompts);
    expect(generatedPrompt).toContain(
      'The following are prompts that are being used to test an LLM application:',
    );
    expect(generatedPrompt).toContain('<prompt>\nPrompt 1\n</prompt>');
    expect(generatedPrompt).toContain('<prompt>\nPrompt 2\n</prompt>');
    expect(generatedPrompt).toContain(
      'Given the above prompts, output the "system purpose" of the application in a single sentence.',
    );
  });

  it('should process the output correctly', () => {
    const output = '  Analyze medical images for anomalies  ';
    const processedOutput = extractor['processOutput'](output);
    expect(processedOutput).toBe('Analyze medical images for anomalies');
  });

  it('should extract system purpose correctly', async () => {
    const result = await extractor.extract(['Prompt 1', 'Prompt 2']);
    expect(result).toBe('Analyze medical images for anomalies');
    expect(provider.callApi).toHaveBeenCalledTimes(1);
  });
});

describe('extractSystemPurpose', () => {
  it('should call the extractor and return the result', async () => {
    const provider: ApiProvider = {
      callApi: jest.fn().mockResolvedValue({ output: 'Test purpose' }),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    const result = await extractSystemPurpose(provider, ['Prompt 1', 'Prompt 2']);
    expect(result).toBe('Test purpose');
    expect(provider.callApi).toHaveBeenCalledTimes(1);
  });
});
