import fs from 'fs';
import { createDummyFiles, reportProviderAPIKeyWarnings } from '../src/onboarding';

describe('reportProviderAPIKeyWarnings', () => {
  const openaiID = 'openai:gpt-4o';
  const anthropicID = 'anthropic:messages:claude-3-5-sonnet-20240620';
  let oldEnv: any = {};

  beforeAll(() => {
    oldEnv = { ...process.env };
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
  });

  afterAll(() => {
    process.env = { ...oldEnv };
  });

  it('should produce a warning for openai if env key is not set', () => {
    expect(reportProviderAPIKeyWarnings([openaiID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
      ]),
    );
  });

  it('should produce a warning for anthropic if env key is not set', () => {
    expect(reportProviderAPIKeyWarnings([anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });

  it('should produce multiple warnings for applicable providers if env keys are not set', () => {
    expect(reportProviderAPIKeyWarnings([openaiID, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
  it('should be able to accept an object input so long as it has a valid id field', () => {
    expect(reportProviderAPIKeyWarnings([{ id: openaiID }, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('OPENAI_API_KEY environment variable is not set'),
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });

  it('should produce only warnings for applicable providers if the env keys are not set', () => {
    // Stub what would be the openai api key env variable.
    process.env.OPENAI_API_KEY = '<my-api-key>';
    expect(reportProviderAPIKeyWarnings([openaiID, anthropicID])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ANTHROPIC_API_KEY environment variable is not set'),
      ]),
    );
  });
});

describe('createDummyFiles', () => {
  it('should create Python provider file for file:// prefix syntax', async () => {
    const mockWriteFileSync = jest.spyOn(fs, 'writeFileSync');
    await createDummyFiles('file://provider.py');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('provider.py'),
      expect.stringContaining(
        'def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> ProviderResponse:',
      ),
    );
  });

  it('should create JavaScript provider file for file:// prefix syntax', async () => {
    const mockWriteFileSync = jest.spyOn(fs, 'writeFileSync');
    await createDummyFiles('file://provider.js');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('provider.js'),
      expect.stringContaining('async function callApi(prompt, options, context) {'),
    );
  });
});
