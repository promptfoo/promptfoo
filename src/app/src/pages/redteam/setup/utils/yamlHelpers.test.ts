import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateOrderedYaml } from './yamlHelpers';

import type { Config } from '../types';

// Mock the external dependencies
vi.mock('@promptfoo/redteam/constants', () => ({
  subCategoryDescriptions: {
    'plugin-1': 'Test plugin 1 description',
    'plugin-2': 'Test plugin 2 description',
    'strategy-1': 'Test strategy 1 description',
  },
}));

vi.mock('@promptfoo/redteam/sharedFrontend', () => ({
  getUnifiedConfig: vi.fn(),
}));

vi.mock('js-yaml', () => ({
  default: {
    dump: vi.fn(),
  },
}));

import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import yaml from 'js-yaml';

describe('yamlHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUnifiedConfig).mockReset();
    vi.mocked(yaml.dump).mockReset();
  });

  describe('generateOrderedYaml', () => {
    it('should generate YAML with schema comment', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: {
          id: 'test-target',
          config: {},
        },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        targets: { id: 'test-target' },
        prompts: ['prompt1'],
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test config\n');

      const result = generateOrderedYaml(mockConfig);

      expect(result).toContain('# yaml-language-server:');
      expect(result).toContain('$schema=https://promptfoo.dev/config-schema.json');
    });

    it('should add purpose to redteam config when provided', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
        purpose: 'Test purpose',
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {} as Record<string, any>,
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test config\n');

      generateOrderedYaml(mockConfig);

      expect(mockUnifiedConfig.redteam.purpose).toBe('Test purpose');
    });

    it('should add entities to redteam config when provided', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: ['entity1', 'entity2'],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {} as Record<string, any>,
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test config\n');

      generateOrderedYaml(mockConfig);

      expect(mockUnifiedConfig.redteam.entities).toEqual(['entity1', 'entity2']);
    });

    it('should not add entities when array is empty', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {} as Record<string, any>,
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test config\n');

      generateOrderedYaml(mockConfig);

      expect(mockUnifiedConfig.redteam.entities).toBeUndefined();
    });

    it('should call yaml.dump with correct options', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test config\n');

      generateOrderedYaml(mockConfig);

      expect(yaml.dump).toHaveBeenCalledWith(expect.any(Object), { noRefs: true, lineWidth: -1 });
    });

    it('should order top-level and redteam keys before dumping', () => {
      const mockConfig: Config = {
        description: 'Ordered config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [{ id: 'plugin-1' }],
        strategies: ['strategy-1'],
        applicationDefinition: {},
        entities: ['entity-1'],
        purpose: 'Security testing',
      };

      const mockUnifiedConfig = {
        defaultTest: { assert: [] },
        customKey: true,
        prompts: ['prompt1'],
        description: 'Ordered config',
        redteam: {
          numTests: 3,
          maxCharsPerMessage: 120,
          maxConcurrency: 4,
          sharing: true,
          strategies: ['strategy-1'],
          plugins: [{ id: 'plugin-1' }],
          entities: ['stale-entity'],
          frameworks: ['owasp:llm'],
          language: 'en',
          purpose: 'stale purpose',
          provider: { id: 'provider' },
        },
        targets: [{ id: 'test-target' }],
        extensions: ['ext'],
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Ordered config\n');

      generateOrderedYaml(mockConfig);

      const dumpedConfig = vi.mocked(yaml.dump).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(Object.keys(dumpedConfig)).toEqual([
        'description',
        'targets',
        'prompts',
        'extensions',
        'redteam',
        'defaultTest',
        'customKey',
      ]);
      expect(Object.keys(dumpedConfig.redteam as Record<string, unknown>)).toEqual([
        'purpose',
        'provider',
        'frameworks',
        'entities',
        'plugins',
        'strategies',
        'language',
        'numTests',
        'maxCharsPerMessage',
        'maxConcurrency',
        'sharing',
      ]);
      expect((dumpedConfig.redteam as Record<string, unknown>).purpose).toBe('Security testing');
      expect((dumpedConfig.redteam as Record<string, unknown>).entities).toEqual(['entity-1']);
      expect((dumpedConfig.redteam as Record<string, unknown>).frameworks).toEqual(['owasp:llm']);
      expect((dumpedConfig.redteam as Record<string, unknown>).sharing).toBe(true);
    });

    it('should add comments for plugin descriptions', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('  - id: plugin-1\n  - id: plugin-2\n');

      const result = generateOrderedYaml(mockConfig);

      expect(result).toContain('- id: plugin-1  # Test plugin 1 description');
      expect(result).toContain('- id: plugin-2  # Test plugin 2 description');
    });

    it('should handle plugins without descriptions', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('  - id: unknown-plugin\n');

      const result = generateOrderedYaml(mockConfig);

      // Should not add comment for unknown plugin
      expect(result).toContain('- id: unknown-plugin');
      expect(result).not.toContain('- id: unknown-plugin  #');
    });

    it('should handle multi-line YAML with mixed plugin IDs', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue(
        'description: Test\n  - id: plugin-1\n  - id: unknown\n  - id: strategy-1\n',
      );

      const result = generateOrderedYaml(mockConfig);

      expect(result).toContain('- id: plugin-1  # Test plugin 1 description');
      expect(result).toContain('- id: unknown\n'); // No comment
      expect(result).toContain('- id: strategy-1  # Test strategy 1 description');
    });

    it('should preserve YAML structure without id lines', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test\nprompts:\n  - prompt1\n');

      const result = generateOrderedYaml(mockConfig);

      expect(result).toContain('description: Test');
      expect(result).toContain('prompts:');
      expect(result).toContain('  - prompt1');
    });

    it('should handle complex config with purpose and entities', () => {
      const mockConfig: Config = {
        description: 'Complex test',
        prompts: ['prompt1', 'prompt2'],
        target: { id: 'test-target', config: {} },
        plugins: [{ id: 'plugin-1' }],
        strategies: ['strategy-1'],
        applicationDefinition: {},
        entities: ['user', 'admin'],
        purpose: 'Security testing',
      };

      const mockUnifiedConfig = {
        description: 'Complex test',
        prompts: ['prompt1', 'prompt2'],
        redteam: {
          plugins: [{ id: 'plugin-1' }],
          strategies: ['strategy-1'],
        } as Record<string, any>,
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Complex test\n');

      generateOrderedYaml(mockConfig);

      expect(mockUnifiedConfig.redteam.purpose).toBe('Security testing');
      expect(mockUnifiedConfig.redteam.entities).toEqual(['user', 'admin']);
      expect(getUnifiedConfig).toHaveBeenCalledWith(mockConfig);
      expect(yaml.dump).toHaveBeenCalled();
    });

    it('should not add empty purpose', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
        purpose: '',
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {} as Record<string, any>,
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test config\n');

      generateOrderedYaml(mockConfig);

      // Empty string is falsy, so purpose should not be set
      expect(mockUnifiedConfig.redteam.purpose).toBeUndefined();
    });

    it('should handle undefined purpose', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {} as Record<string, any>,
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test config\n');

      generateOrderedYaml(mockConfig);

      expect(mockUnifiedConfig.redteam.purpose).toBeUndefined();
    });

    it('should handle whitespace-only lines in YAML', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('description: Test\n  \n  - id: plugin-1\n');

      const result = generateOrderedYaml(mockConfig);

      // Whitespace-only lines should be preserved
      expect(result).toContain('description: Test\n  \n  - id: plugin-1');
    });

    it('should handle plugin IDs with special characters', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('  - id: plugin-with-dashes-123\n');

      const result = generateOrderedYaml(mockConfig);

      // Should preserve the id even without description
      expect(result).toContain('- id: plugin-with-dashes-123');
    });

    it('should handle indented plugin IDs correctly', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      const mockUnifiedConfig = {
        description: 'Test config',
        redteam: {},
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue('plugins:\n    - id: plugin-1\n');

      const result = generateOrderedYaml(mockConfig);

      expect(result).toContain('    - id: plugin-1  # Test plugin 1 description');
    });

    it('should preserve custom keys not in standard key order', () => {
      const mockConfig: Config = {
        description: 'Test config',
        prompts: ['prompt1'],
        target: { id: 'test-target', config: {} },
        plugins: [],
        strategies: [],
        applicationDefinition: {},
        entities: [],
      };

      // Return config with custom keys not in the standard keyOrder
      const mockUnifiedConfig = {
        description: 'Test config',
        targets: { id: 'test-target' },
        prompts: ['prompt1'],
        redteam: {},
        customKey: 'custom value',
        anotherCustomKey: { nested: 'object' },
      };

      vi.mocked(getUnifiedConfig).mockReturnValue(mockUnifiedConfig as any);
      vi.mocked(yaml.dump).mockReturnValue(
        'description: Test config\ncustomKey: custom value\nanotherCustomKey:\n  nested: object\n',
      );

      const result = generateOrderedYaml(mockConfig);

      // Verify the function completes without errors
      expect(result).toContain('description: Test config');
      expect(result).toContain('customKey: custom value');
      // Verify yaml.dump was called with the ordered config including custom keys
      expect(yaml.dump).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test config',
          customKey: 'custom value',
          anotherCustomKey: { nested: 'object' },
        }),
        { noRefs: true, lineWidth: -1 },
      );
    });
  });
});
