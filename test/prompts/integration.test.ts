import { readPrompts } from '../../src/prompts';
import { PromptManager } from '../../src/prompts/management/PromptManager';
import type { ManagedPromptWithVersions } from '../../src/types/prompt-management';

jest.mock('../../src/prompts/management/PromptManager');

describe('Managed prompts integration', () => {
  const mockPromptManager = jest.mocked(PromptManager);

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock trackUsage to return a resolved promise
    mockPromptManager.prototype.trackUsage = jest.fn().mockResolvedValue(undefined);
  });

  const createMockPrompt = (): ManagedPromptWithVersions => ({
    id: 'greeting-prompt',
    name: 'Greeting Prompt',
    description: 'A friendly greeting prompt',
    currentVersion: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    author: 'test@example.com',
    versions: [
      {
        id: 'greeting-prompt-v1',
        promptId: 'greeting-prompt',
        version: 1,
        content: 'Hello {{name}}, how can I help you today?',
        author: 'test@example.com',
        createdAt: new Date('2024-01-01'),
        notes: 'Initial version',
      },
    ],
    deployments: {},
  });

  it('should load a managed prompt via readPrompts', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const prompts = await readPrompts('pf://greeting-prompt');

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toEqual({
      raw: 'Hello {{name}}, how can I help you today?',
      label: 'Greeting Prompt v1',
      display: 'Greeting Prompt (v1)',
    });
  });

  it('should load multiple prompts including managed ones', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const prompts = await readPrompts([
      'This is a direct prompt',
      'pf://greeting-prompt',
      { raw: 'Another direct prompt', label: 'Direct 2' },
    ]);

    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toEqual({
      raw: 'This is a direct prompt',
      label: 'This is a direct prompt',
    });
    expect(prompts[1]).toEqual({
      raw: 'Hello {{name}}, how can I help you today?',
      label: 'Greeting Prompt v1',
      display: 'Greeting Prompt (v1)',
    });
    expect(prompts[2]).toEqual({
      raw: 'Another direct prompt',
      label: 'Direct 2',
    });
  });

  it('should handle prompt configuration passthrough', async () => {
    const mockPrompt = createMockPrompt();
    mockPromptManager.prototype.getPrompt.mockResolvedValue(mockPrompt);

    const prompts = await readPrompts([
      {
        raw: 'pf://greeting-prompt',
        label: 'Custom Greeting',
        config: { temperature: 0.9 },
      },
    ]);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toEqual({
      raw: 'Hello {{name}}, how can I help you today?',
      label: 'Custom Greeting',
      display: 'Greeting Prompt (v1)',
      config: { temperature: 0.9 },
    });
  });

  it('should handle errors gracefully', async () => {
    mockPromptManager.prototype.getPrompt.mockResolvedValue(null);

    await expect(readPrompts('pf://nonexistent')).rejects.toThrow(
      'Managed prompt not found: nonexistent',
    );
  });
});
