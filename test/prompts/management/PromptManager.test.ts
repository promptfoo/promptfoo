import fs from 'fs/promises';
import yaml from 'js-yaml';
import { PromptManager } from '../../../src/prompts/management/PromptManager';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import { fetchWithRetries } from '../../../src/fetch';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import type { PromptYaml } from '../../../src/types/prompt-management';

jest.mock('fs/promises');
jest.mock('../../../src/globalConfig/cloud');
jest.mock('../../../src/fetch');
jest.mock('../../../src/globalConfig/accounts');

describe('PromptManager', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;
  const mockFetchWithRetries = jest.mocked(fetchWithRetries);
  const mockGetUserEmail = jest.mocked(getUserEmail);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserEmail.mockReturnValue('test@example.com');
    // Default to local mode
    process.env.PROMPTFOO_PROMPT_LOCAL_MODE = 'true';
    mockCloudConfig.isEnabled.mockReturnValue(false);
  });

  describe('Local Mode', () => {
    it('should create a prompt in local mode', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValue();

      const manager = new PromptManager();
      const result = await manager.createPrompt('test-prompt', 'Test description', 'Hello world');

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-prompt.yaml'),
        expect.stringContaining('Hello world'),
        'utf-8',
      );

      expect(result).toMatchObject({
        id: 'test-prompt',
        name: 'test-prompt',
        description: 'Test description',
        currentVersion: 1,
        author: 'test@example.com',
      });
    });

    it('should throw error if prompt already exists', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(); // File exists

      const manager = new PromptManager();

      await expect(manager.createPrompt('existing-prompt')).rejects.toThrow(
        'Prompt with id "existing-prompt" already exists',
      );
    });

    it('should list prompts from local files', async () => {
      mockFs.readdir.mockResolvedValue(['prompt1.yaml', 'prompt2.yaml', 'other.txt'] as any);

      const promptYaml: PromptYaml = {
        id: 'prompt1',
        description: 'First prompt',
        currentVersion: 1,
        versions: [
          {
            version: 1,
            author: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
            content: 'Content 1',
            notes: 'Initial',
          },
        ],
        deployments: {},
      };

      mockFs.readFile.mockResolvedValue(yaml.dump(promptYaml));

      const manager = new PromptManager();
      const prompts = await manager.listPrompts();

      expect(prompts).toHaveLength(2); // Only YAML files
      expect(prompts[0]).toMatchObject({
        id: 'prompt1',
        name: 'prompt1',
        description: 'First prompt',
      });
    });

    it('should get a specific prompt', async () => {
      const promptYaml: PromptYaml = {
        id: 'test-prompt',
        description: 'Test prompt',
        currentVersion: 2,
        versions: [
          {
            version: 1,
            author: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
            content: 'Version 1',
            notes: 'Initial',
          },
          {
            version: 2,
            author: 'test@example.com',
            createdAt: '2024-01-02T00:00:00Z',
            content: 'Version 2',
            notes: 'Updated',
          },
        ],
        deployments: { production: 1 },
      };

      mockFs.readFile.mockResolvedValue(yaml.dump(promptYaml));

      const manager = new PromptManager();
      const prompt = await manager.getPrompt('test-prompt');

      expect(prompt).toBeTruthy();
      expect(prompt?.versions).toHaveLength(2);
      expect(prompt?.deployments).toEqual({ production: 1 });
    });

    it('should update a prompt with new version', async () => {
      const existingYaml: PromptYaml = {
        id: 'test-prompt',
        currentVersion: 1,
        versions: [
          {
            version: 1,
            author: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
            content: 'Version 1',
            notes: 'Initial',
          },
        ],
        deployments: {},
      };

      // Mock the first read (before update)
      mockFs.readFile.mockResolvedValueOnce(yaml.dump(existingYaml));

      // Mock the second read (after update) to return the updated version
      const updatedYaml: PromptYaml = {
        ...existingYaml,
        currentVersion: 2,
        versions: [
          ...existingYaml.versions,
          {
            version: 2,
            author: 'test@example.com',
            createdAt: new Date().toISOString(),
            content: 'Version 2',
            notes: 'Updated',
          },
        ],
      };
      mockFs.readFile.mockResolvedValueOnce(yaml.dump(updatedYaml));

      mockFs.writeFile.mockResolvedValue();

      const manager = new PromptManager();
      const result = await manager.updatePrompt('test-prompt', 'Version 2', 'Updated');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-prompt.yaml'),
        expect.stringContaining('Version 2'),
        'utf-8',
      );
      expect(result.currentVersion).toBe(2);
    });

    it('should deploy a prompt version', async () => {
      const promptYaml: PromptYaml = {
        id: 'test-prompt',
        currentVersion: 2,
        versions: [
          {
            version: 1,
            author: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
            content: 'Version 1',
            notes: 'Initial',
          },
          {
            version: 2,
            author: 'test@example.com',
            createdAt: '2024-01-02T00:00:00Z',
            content: 'Version 2',
            notes: 'Updated',
          },
        ],
        deployments: {},
      };

      mockFs.readFile.mockResolvedValue(yaml.dump(promptYaml));
      mockFs.writeFile.mockResolvedValue();

      const manager = new PromptManager();
      await manager.deployPrompt('test-prompt', 'production', 1);

      const writtenContent = mockFs.writeFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('production: 1');
    });

    it('should delete a prompt', async () => {
      mockFs.unlink.mockResolvedValue();

      const manager = new PromptManager();
      await manager.deletePrompt('test-prompt');

      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('test-prompt.yaml'));
    });
  });

  describe('Cloud Mode', () => {
    beforeEach(() => {
      process.env.PROMPTFOO_PROMPT_LOCAL_MODE = 'false';
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudConfig.getApiHost.mockReturnValue('https://api.promptfoo.dev');
      mockCloudConfig.getApiKey.mockReturnValue('test-api-key');
    });

    it('should create a prompt in cloud mode', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'test-prompt',
          name: 'test-prompt',
          description: 'Test description',
          currentVersion: 1,
          versions: [
            {
              id: 'v1',
              version: 1,
              content: 'Hello world',
            },
          ],
        }),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const manager = new PromptManager();
      const result = await manager.createPrompt('test-prompt', 'Test description', 'Hello world');

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.promptfoo.dev/api/prompts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
        30000,
      );

      expect(result).toMatchObject({
        id: 'test-prompt',
        name: 'test-prompt',
      });
    });

    it('should throw error if not authenticated', async () => {
      mockCloudConfig.getApiKey.mockReturnValue(undefined);

      const manager = new PromptManager();

      await expect(manager.createPrompt('test')).rejects.toThrow('Not authenticated');
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        text: jest.fn().mockResolvedValue('API Error'),
      };

      mockFetchWithRetries.mockResolvedValue(mockResponse as any);

      const manager = new PromptManager();

      await expect(manager.createPrompt('test')).rejects.toThrow(
        'Failed to create prompt: API Error',
      );
    });
  });

  describe('Mode Detection', () => {
    it('should use local mode when PROMPTFOO_PROMPT_LOCAL_MODE is true', () => {
      process.env.PROMPTFOO_PROMPT_LOCAL_MODE = 'true';
      mockCloudConfig.isEnabled.mockReturnValue(true); // Cloud is enabled but overridden

      const manager = new PromptManager();
      expect(manager['config'].mode).toBe('local');
    });

    it('should use cloud mode when cloud is enabled and env var not set', () => {
      delete process.env.PROMPTFOO_PROMPT_LOCAL_MODE;
      mockCloudConfig.isEnabled.mockReturnValue(true);

      const manager = new PromptManager();
      expect(manager['config'].mode).toBe('cloud');
    });

    it('should use local mode when cloud is disabled', () => {
      delete process.env.PROMPTFOO_PROMPT_LOCAL_MODE;
      mockCloudConfig.isEnabled.mockReturnValue(false);

      const manager = new PromptManager();
      expect(manager['config'].mode).toBe('local');
    });
  });

  describe('Diff Functionality', () => {
    it('should generate diff between versions', async () => {
      const promptYaml: PromptYaml = {
        id: 'test-prompt',
        currentVersion: 2,
        versions: [
          {
            version: 1,
            author: 'test@example.com',
            createdAt: '2024-01-01T00:00:00Z',
            content: 'Line 1\nLine 2\nLine 3',
            notes: 'Initial',
          },
          {
            version: 2,
            author: 'test@example.com',
            createdAt: '2024-01-02T00:00:00Z',
            content: 'Line 1\nLine 2 modified\nLine 3\nLine 4 added',
            notes: 'Updated',
          },
        ],
        deployments: {},
      };

      mockFs.readFile.mockResolvedValue(yaml.dump(promptYaml));

      const manager = new PromptManager();
      const diff = await manager.diffPromptVersions('test-prompt', 1, 2);

      expect(diff).toContain('Diff between version 1 and version 2');
      expect(diff).toMatch(/[+-]/); // Should contain diff markers
    });
  });
});
