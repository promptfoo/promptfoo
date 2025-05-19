import cliProgress from 'cli-progress';
import { loadApiProvider } from '../../src/providers';
import { STRATEGY_COLLECTION_MAPPINGS } from '../../src/redteam/constants';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import { synthesize } from '../../src/redteam/index';
import { validateStrategies } from '../../src/redteam/strategies';

jest.mock('cli-progress');
jest.mock('../../src/providers');
jest.mock('../../src/redteam/extraction/entities');
jest.mock('../../src/redteam/extraction/purpose');
jest.mock('../../src/util/templates', () => {
  const originalModule = jest.requireActual('../../src/util/templates');
  return {
    ...originalModule,
    extractVariablesFromTemplates: jest.fn(originalModule.extractVariablesFromTemplates),
  };
});

jest.mock('process', () => ({
  ...jest.requireActual('process'),
  exit: jest.fn(),
}));

jest.mock('../../src/redteam/strategies', () => ({
  ...jest.requireActual('../../src/redteam/strategies'),
  validateStrategies: jest.fn(),
}));

jest.mock('../../src/util/apiHealth');
jest.mock('../../src/redteam/remoteGeneration');

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
    jest.mocked(validateStrategies).mockImplementation(() => Promise.resolve());
    jest.mocked(cliProgress.SingleBar).mockReturnValue({
      increment: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      update: jest.fn(),
    } as any);

    mockProvider.generate.mockResolvedValue([
      {
        output: 'test output',
        metadata: { pluginId: 'test-plugin' },
      },
    ]);
  });

  describe('Strategy Collections', () => {
    it('should expand strategy collections into individual strategies', async () => {
      const mockCollectionId = Object.keys(STRATEGY_COLLECTION_MAPPINGS)[0];
      const expectedStrategies =
        STRATEGY_COLLECTION_MAPPINGS[mockCollectionId as keyof typeof STRATEGY_COLLECTION_MAPPINGS];

      await synthesize({
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        strategies: [{ id: mockCollectionId }],
        prompts: ['test prompt'],
        injectVar: 'input',
        provider: mockProvider,
        language: 'en',
        numTests: 1,
        targetLabels: ['test-provider'],
      });

      expect(validateStrategies).toHaveBeenCalledWith(
        expect.arrayContaining(expectedStrategies.map((id) => ({ id }))),
      );
    });

    it('should propagate strategy config to expanded strategies', async () => {
      const mockCollectionId = Object.keys(STRATEGY_COLLECTION_MAPPINGS)[0];
      const strategyConfig = {
        customOption: 'test',
        enabled: true,
      };

      await synthesize({
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        strategies: [
          {
            id: mockCollectionId,
            config: strategyConfig,
          },
        ],
        prompts: ['test prompt'],
        injectVar: 'input',
        provider: mockProvider,
        language: 'en',
        numTests: 1,
        targetLabels: ['test-provider'],
      });

      const expandedStrategies =
        STRATEGY_COLLECTION_MAPPINGS[mockCollectionId as keyof typeof STRATEGY_COLLECTION_MAPPINGS];
      expect(validateStrategies).toHaveBeenCalledWith(
        expect.arrayContaining(
          expandedStrategies.map((id) => ({
            id,
            config: strategyConfig,
          })),
        ),
      );
    });

    it('should handle multiple strategy collections', async () => {
      const collections = Object.keys(STRATEGY_COLLECTION_MAPPINGS).slice(0, 2);
      const expectedStrategies = collections.flatMap(
        (id) => STRATEGY_COLLECTION_MAPPINGS[id as keyof typeof STRATEGY_COLLECTION_MAPPINGS],
      );

      await synthesize({
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        strategies: collections.map((id) => ({ id })),
        prompts: ['test prompt'],
        injectVar: 'input',
        provider: mockProvider,
        language: 'en',
        numTests: 1,
        targetLabels: ['test-provider'],
      });

      expect(validateStrategies).toHaveBeenCalledWith(
        expect.arrayContaining(expectedStrategies.map((id) => ({ id }))),
      );
    });

    it('should handle mix of strategy collections and individual strategies', async () => {
      const mockCollectionId = Object.keys(STRATEGY_COLLECTION_MAPPINGS)[0];
      const individualStrategy = 'basic';
      const expectedStrategies = [
        ...STRATEGY_COLLECTION_MAPPINGS[
          mockCollectionId as keyof typeof STRATEGY_COLLECTION_MAPPINGS
        ],
        individualStrategy,
      ];

      await synthesize({
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        strategies: [{ id: mockCollectionId }, { id: individualStrategy }],
        prompts: ['test prompt'],
        injectVar: 'input',
        provider: mockProvider,
        language: 'en',
        numTests: 1,
        targetLabels: ['test-provider'],
      });

      expect(validateStrategies).toHaveBeenCalledWith(
        expect.arrayContaining([...expectedStrategies.map((id) => ({ id }))]),
      );
    });

    it('should validate expanded strategies', async () => {
      const mockCollectionId = Object.keys(STRATEGY_COLLECTION_MAPPINGS)[0];

      await synthesize({
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        strategies: [{ id: mockCollectionId }],
        prompts: ['test prompt'],
        injectVar: 'input',
        provider: mockProvider,
        language: 'en',
        numTests: 1,
        targetLabels: ['test-provider'],
      });

      const expectedStrategies = STRATEGY_COLLECTION_MAPPINGS[
        mockCollectionId as keyof typeof STRATEGY_COLLECTION_MAPPINGS
      ].map((id) => ({ id }));

      expect(validateStrategies).toHaveBeenCalledWith(expect.arrayContaining(expectedStrategies));
    });

    it('should ignore non-existent strategy collections', async () => {
      await synthesize({
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        strategies: [{ id: 'non-existent-collection' }],
        prompts: ['test prompt'],
        injectVar: 'input',
        provider: mockProvider,
        language: 'en',
        numTests: 1,
        targetLabels: ['test-provider'],
      });

      expect(validateStrategies).toHaveBeenCalledWith([{ id: 'non-existent-collection' }]);
    });

    it('should throw error for invalid strategy collection', async () => {
      jest.mocked(validateStrategies).mockImplementation(() => {
        throw new Error('Invalid strategies');
      });

      await expect(
        synthesize({
          plugins: [{ id: 'test-plugin', numTests: 1 }],
          strategies: [{ id: 'invalid-strategy' }],
          prompts: ['test prompt'],
          injectVar: 'input',
          provider: mockProvider,
          language: 'en',
          numTests: 1,
          targetLabels: ['test-provider'],
        }),
      ).rejects.toThrow('Invalid strategies');
    });
  });

  describe('Input handling', () => {
    it('should use provided purpose and entities if given', async () => {
      const result = await synthesize({
        entities: ['custom-entity'],
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        purpose: 'Custom purpose',
        strategies: [],
        targetLabels: ['test-provider'],
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
  });
});
