import { processManagedPrompt } from '../../../src/prompts/processors/managed';
import { PromptManager } from '../../../src/prompts/management/PromptManager';
import type { ManagedPromptWithVersions } from '../../../src/types/prompt-management';

jest.mock('../../../src/prompts/management/PromptManager');

describe('processManagedPrompt', () => {
  const mockPromptManager = jest.mocked(PromptManager);

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock trackUsage to return a resolved promise
    jest.spyOn(mockPromptManager.prototype, 'trackUsage').mockImplementation().mockResolvedValue(undefined);
  });

  const createMockPrompt = (overrides?: Partial<ManagedPromptWithVersions>): ManagedPromptWithVersions => ({
    id: 'test-prompt',
    name: 'Test Prompt',
    description: 'A test prompt',
    currentVersion: 2,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    author: 'test@example.com',
    versions: [
      {
        id: 'test-prompt-v1',
        promptId: 'test-prompt',
        version: 1,
        content: 'You are a helpful assistant v1',
        author: 'test@example.com',
        createdAt: new Date('2024-01-01'),
        notes: 'Initial version',
      },
      {
        id: 'test-prompt-v2',
        promptId: 'test-prompt',
        version: 2,
        content: 'You are a helpful assistant v2',
        author: 'test@example.com',
        createdAt: new Date('2024-01-02'),
        notes: 'Updated version',
      },
    ],
    deployments: {
      production: 1,
      staging: 2,
    },
    ...overrides,
  });

  it('should process a basic managed prompt', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const result = await processManagedPrompt({ raw: 'pf://test-prompt' });

    expect(mockPromptManager.prototype.getPrompt).toHaveBeenCalledWith('test-prompt');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      raw: 'You are a helpful assistant v2',
      label: 'Test Prompt v2',
      display: 'Test Prompt (v2)',
    });
  });

  it('should process a managed prompt with specific version', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const result = await processManagedPrompt({ raw: 'pf://test-prompt:1' });

    expect(result[0]).toEqual({
      raw: 'You are a helpful assistant v1',
      label: 'Test Prompt v1',
      display: 'Test Prompt (v1)',
    });
  });

  it('should process a managed prompt with environment deployment', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const result = await processManagedPrompt({ raw: 'pf://test-prompt:production' });

    expect(result[0]).toEqual({
      raw: 'You are a helpful assistant v1',
      label: 'Test Prompt v1',
      display: 'Test Prompt (v1)',
    });
  });

  it('should preserve config from the prompt reference', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const result = await processManagedPrompt({ 
      raw: 'pf://test-prompt',
      config: { temperature: 0.7 }
    });

    expect(result[0].config).toEqual({ temperature: 0.7 });
  });

  it('should throw error for invalid prompt format', async () => {
    await expect(processManagedPrompt({ raw: 'managed:test' }))
      .rejects.toThrow('Invalid managed prompt format: managed:test');
  });

  it('should throw error for invalid prompt ID', async () => {
    await expect(processManagedPrompt({ raw: 'pf://test prompt with spaces' }))
      .rejects.toThrow('Invalid prompt ID: test prompt with spaces');
  });

  it('should throw error when prompt not found', async () => {
    mockPromptManager.prototype.getPrompt.mockResolvedValue(null);

    await expect(processManagedPrompt({ raw: 'pf://nonexistent' }))
      .rejects.toThrow('Managed prompt not found: nonexistent');
  });

  it('should throw error for invalid version', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    await expect(processManagedPrompt({ raw: 'pf://test-prompt:999' }))
      .rejects.toThrow('Version 999 not found for prompt: test-prompt');
  });

  it('should throw error for nonexistent environment', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    await expect(processManagedPrompt({ raw: 'pf://test-prompt:development' }))
      .rejects.toThrow('No deployment found for environment: development');
  });

  it('should use custom label if provided', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const result = await processManagedPrompt({ 
      raw: 'pf://test-prompt',
      label: 'Custom Label'
    });

    expect(result[0].label).toBe('Custom Label');
  });
});
