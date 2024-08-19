import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import { synthesize } from '../../src/redteam/index';
import { Plugins } from '../../src/redteam/plugins';

jest.mock('../../src/logger');
jest.mock('../../src/providers');
jest.mock('../../src/redteam/extraction/entities');
jest.mock('../../src/redteam/extraction/purpose');

jest.mock('process', () => ({
  ...jest.requireActual('process'),
  exit: jest.fn(),
}));

describe('synthesize', () => {
  const mockProvider = {
    callApi: jest.fn(),
    generate: jest.fn(),
    id: () => 'test-provider',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(extractEntities).mockResolvedValue(['entity1', 'entity2']);
    jest.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process.exit called with code ${code}`);
    });
  });

  it('should use provided purpose and entities if given', async () => {
    const result = await synthesize({
      entities: ['custom-entity'],
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      purpose: 'Custom purpose',
      strategies: [],
    });

    expect(result).toEqual(
      expect.objectContaining({
        entities: ['custom-entity'],
        purpose: 'Custom purpose',
      }),
    );
    expect(extractEntities).not.toHaveBeenCalled();
    expect(extractSystemPurpose).not.toHaveBeenCalled();
  });

  it('should extract purpose and entities if not provided', async () => {
    await synthesize({
      language: 'english',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(extractEntities).toHaveBeenCalledWith(expect.any(Object), ['Test prompt']);
    expect(extractSystemPurpose).toHaveBeenCalledWith(expect.any(Object), ['Test prompt']);
  });

  it('should use the provided API provider if given', async () => {
    const customProvider = { callApi: jest.fn(), generate: jest.fn(), id: () => 'custom-provider' };
    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      provider: customProvider,
      strategies: [],
    });

    expect(loadApiProvider).not.toHaveBeenCalled();
  });

  it('should load the default provider if not provided', async () => {
    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(loadApiProvider).toHaveBeenCalledWith('openai:chat:gpt-4o', {
      options: { config: { temperature: 0.5 } },
    });
  });

  it('should generate test cases for each plugin', async () => {
    const mockPluginAction = jest.fn().mockResolvedValue([{ test: 'case' }]);
    jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

    const result = await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [
        { id: 'plugin1', numTests: 2 },
        { id: 'plugin2', numTests: 3 },
      ],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(mockPluginAction).toHaveBeenCalledTimes(2);
    expect(result.testCases).toEqual([
      expect.objectContaining({ metadata: expect.objectContaining({ pluginId: 'plugin1' }) }),
      expect.objectContaining({ metadata: expect.objectContaining({ pluginId: 'plugin2' }) }),
    ]);
  });

  it('should warn about unregistered plugins', async () => {
    jest.spyOn(Plugins, 'find').mockReturnValue(undefined);

    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'unregistered-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(logger.warn).toHaveBeenCalledWith('Plugin unregistered-plugin not registered, skipping');
  });

  it('should call process.exit when invalid strategies are provided', async () => {
    await expect(
      synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'invalid-strategy' }],
      }),
    ).rejects.toThrow('Process.exit called with code 1');

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
