import { renderPrompt } from '../src/evaluatorHelpers';
import * as langfuseIntegration from '../src/integrations/langfuse';

import type { Prompt } from '../src/types';

jest.mock('../src/integrations/langfuse');

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('renderPrompt - Langfuse integration', () => {
  let mockGetPrompt: jest.MockedFunction<typeof langfuseIntegration.getPrompt>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrompt = jest.mocked(langfuseIntegration.getPrompt);
  });

  describe('version-based prompts', () => {
    it('should handle langfuse:// prompt with version only', async () => {
      mockGetPrompt.mockResolvedValue('Hello from Langfuse v3');

      const prompt = toPrompt('langfuse://test-prompt:3:text');
      const result = await renderPrompt(prompt, { name: 'World' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'test-prompt',
        { name: 'World' },
        'text',
        3,
        undefined,
      );
      expect(result).toBe('Hello from Langfuse v3');
    });

    it('should handle langfuse:// prompt with version and type', async () => {
      mockGetPrompt.mockResolvedValue('[{"role": "system", "content": "You are helpful"}]');

      const prompt = toPrompt('langfuse://chat-prompt:2:chat');
      const result = await renderPrompt(prompt, { topic: 'AI' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'chat-prompt',
        { topic: 'AI' },
        'chat',
        2,
        undefined,
      );
      expect(result).toBe('[{"role": "system", "content": "You are helpful"}]');
    });

    it('should handle latest version keyword', async () => {
      mockGetPrompt.mockResolvedValue('Latest prompt content');

      const prompt = toPrompt('langfuse://my-prompt:latest:text');
      const result = await renderPrompt(prompt, {}, {});

      // With dual syntax support, 'latest' is now treated as a label
      expect(mockGetPrompt).toHaveBeenCalledWith('my-prompt', {}, 'text', undefined, 'latest');
      expect(result).toBe('Latest prompt content');
    });
  });

  describe('label-based prompts', () => {
    it('should handle langfuse:// prompt with label only', async () => {
      mockGetPrompt.mockResolvedValue('Production prompt');

      const prompt = toPrompt('langfuse://my-prompt@production');
      const result = await renderPrompt(prompt, { env: 'prod' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'my-prompt',
        { env: 'prod' },
        'text',
        undefined,
        'production',
      );
      expect(result).toBe('Production prompt');
    });

    it('should handle langfuse:// prompt with label and type', async () => {
      mockGetPrompt.mockResolvedValue('[{"role": "user", "content": "Hello from staging"}]');

      const prompt = toPrompt('langfuse://chat-prompt@staging:chat');
      const result = await renderPrompt(prompt, { user: 'Alice' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'chat-prompt',
        { user: 'Alice' },
        'chat',
        undefined,
        'staging',
      );
      expect(result).toBe('[{"role": "user", "content": "Hello from staging"}]');
    });

    it('should handle latest label', async () => {
      mockGetPrompt.mockResolvedValue('Latest version via label');

      const prompt = toPrompt('langfuse://test@latest');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('test', {}, 'text', undefined, 'latest');
      expect(result).toBe('Latest version via label');
    });

    it('should handle custom environment labels', async () => {
      mockGetPrompt.mockResolvedValue('Development prompt');

      const prompt = toPrompt('langfuse://feature-prompt@dev');
      const result = await renderPrompt(prompt, { feature: 'new' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'feature-prompt',
        { feature: 'new' },
        'text',
        undefined,
        'dev',
      );
      expect(result).toBe('Development prompt');
    });

    it('should handle tenant-specific labels', async () => {
      mockGetPrompt.mockResolvedValue('Tenant A specific prompt');

      const prompt = toPrompt('langfuse://multi-tenant@tenant-a:chat');
      const result = await renderPrompt(prompt, { tenant: 'A' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'multi-tenant',
        { tenant: 'A' },
        'chat',
        undefined,
        'tenant-a',
      );
      expect(result).toBe('Tenant A specific prompt');
    });

    it('should handle experiment labels', async () => {
      mockGetPrompt.mockResolvedValue('Experiment B prompt');

      const prompt = toPrompt('langfuse://ab-test@experiment-b');
      const result = await renderPrompt(prompt, { variant: 'B' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'ab-test',
        { variant: 'B' },
        'text',
        undefined,
        'experiment-b',
      );
      expect(result).toBe('Experiment B prompt');
    });
  });

  describe('edge cases', () => {
    it('should handle prompt ID with @ symbol correctly with improved parsing', async () => {
      mockGetPrompt.mockResolvedValue('Prompt with @ in ID');

      // Now the improved parsing should handle this correctly
      // 'email@support@production' should parse as:
      // id='email@support', label='production'
      const prompt = toPrompt('langfuse://email@support@production');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'email@support',
        {},
        'text',
        undefined,
        'production',
      );
      expect(result).toBe('Prompt with @ in ID');
    });

    it('should handle prompt ID with multiple @ symbols', async () => {
      mockGetPrompt.mockResolvedValue('Complex prompt ID');

      // 'user@domain@example@staging' should parse as:
      // id='user@domain@example', label='staging'
      const prompt = toPrompt('langfuse://user@domain@example@staging:chat');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'user@domain@example',
        {},
        'chat',
        undefined,
        'staging',
      );
      expect(result).toBe('Complex prompt ID');
    });

    it('should handle prompt ID with colon', async () => {
      mockGetPrompt.mockResolvedValue('Prompt with : in ID');

      const prompt = toPrompt('langfuse://namespace:prompt@staging:chat');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'namespace:prompt',
        {},
        'chat',
        undefined,
        'staging',
      );
      expect(result).toBe('Prompt with : in ID');
    });

    it('should handle missing type (defaults to text)', async () => {
      mockGetPrompt.mockResolvedValue('Default text prompt');

      const prompt = toPrompt('langfuse://simple@prod');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('simple', {}, 'text', undefined, 'prod');
      expect(result).toBe('Default text prompt');
    });

    it('should handle errors from Langfuse', async () => {
      mockGetPrompt.mockRejectedValue(new Error('Prompt not found'));

      const prompt = toPrompt('langfuse://non-existent@production');

      await expect(renderPrompt(prompt, {}, {})).rejects.toThrow('Prompt not found');
    });

    it('should handle mixed case labels', async () => {
      mockGetPrompt.mockResolvedValue('Mixed case label prompt');

      const prompt = toPrompt('langfuse://test@Production:chat');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('test', {}, 'chat', undefined, 'Production');
      expect(result).toBe('Mixed case label prompt');
    });

    it('should handle label with hyphens and underscores', async () => {
      mockGetPrompt.mockResolvedValue('Complex label prompt');

      const prompt = toPrompt('langfuse://test@prod-v2_final');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('test', {}, 'text', undefined, 'prod-v2_final');
      expect(result).toBe('Complex label prompt');
    });
  });

  describe('prompt type variations', () => {
    it('should handle text type with label', async () => {
      mockGetPrompt.mockResolvedValue('Text prompt with label');

      const prompt = toPrompt('langfuse://text-example@production:text');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'text-example',
        {},
        'text',
        undefined,
        'production',
      );
      expect(result).toBe('Text prompt with label');
    });

    it('should handle chat type with label', async () => {
      const chatMessages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: '{{question}}' },
      ];
      mockGetPrompt.mockResolvedValue(JSON.stringify(chatMessages));

      const prompt = toPrompt('langfuse://chat-example@staging:chat');
      const result = await renderPrompt(prompt, { question: 'What is AI?' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'chat-example',
        { question: 'What is AI?' },
        'chat',
        undefined,
        'staging',
      );
      expect(result).toBe(JSON.stringify(chatMessages));
    });
  });

  describe('dual syntax support', () => {
    it('should auto-detect string as label with : syntax', async () => {
      mockGetPrompt.mockResolvedValue('Production prompt via colon');

      const prompt = toPrompt('langfuse://my-prompt:production');
      const result = await renderPrompt(prompt, { env: 'prod' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'my-prompt',
        { env: 'prod' },
        'text',
        undefined,
        'production',
      );
      expect(result).toBe('Production prompt via colon');
    });

    it('should auto-detect string as label with : syntax and type', async () => {
      mockGetPrompt.mockResolvedValue('[{"role": "system", "content": "Staging chat"}]');

      const prompt = toPrompt('langfuse://chat-prompt:staging:chat');
      const result = await renderPrompt(prompt, { user: 'Bob' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'chat-prompt',
        { user: 'Bob' },
        'chat',
        undefined,
        'staging',
      );
      expect(result).toBe('[{"role": "system", "content": "Staging chat"}]');
    });

    it('should still treat numeric values as versions', async () => {
      mockGetPrompt.mockResolvedValue('Version 3 prompt');

      const prompt = toPrompt('langfuse://my-prompt:3:text');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('my-prompt', {}, 'text', 3, undefined);
      expect(result).toBe('Version 3 prompt');
    });

    it('should treat "latest" as label with : syntax', async () => {
      mockGetPrompt.mockResolvedValue('Latest via colon');

      const prompt = toPrompt('langfuse://my-prompt:latest');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('my-prompt', {}, 'text', undefined, 'latest');
      expect(result).toBe('Latest via colon');
    });

    it('should handle complex label names with : syntax', async () => {
      mockGetPrompt.mockResolvedValue('Complex label via colon');

      const prompt = toPrompt('langfuse://test:prod-v2_final:chat');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('test', {}, 'chat', undefined, 'prod-v2_final');
      expect(result).toBe('Complex label via colon');
    });

    it('should prefer @ syntax when both could apply', async () => {
      mockGetPrompt.mockResolvedValue('Explicit @ syntax wins');

      // Even though "123" could be a version, @ makes it explicitly a label
      const prompt = toPrompt('langfuse://my-prompt@123:chat');
      const result = await renderPrompt(prompt, {}, {});

      expect(mockGetPrompt).toHaveBeenCalledWith('my-prompt', {}, 'chat', undefined, '123');
      expect(result).toBe('Explicit @ syntax wins');
    });

    it('should handle tenant labels with : syntax', async () => {
      mockGetPrompt.mockResolvedValue('Tenant A via colon');

      const prompt = toPrompt('langfuse://multi-tenant:tenant-a');
      const result = await renderPrompt(prompt, { tenant: 'A' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'multi-tenant',
        { tenant: 'A' },
        'text',
        undefined,
        'tenant-a',
      );
      expect(result).toBe('Tenant A via colon');
    });

    it('should handle experiment labels with : syntax', async () => {
      mockGetPrompt.mockResolvedValue('Experiment B via colon');

      const prompt = toPrompt('langfuse://ab-test:experiment-b:chat');
      const result = await renderPrompt(prompt, { variant: 'B' }, {});

      expect(mockGetPrompt).toHaveBeenCalledWith(
        'ab-test',
        { variant: 'B' },
        'chat',
        undefined,
        'experiment-b',
      );
      expect(result).toBe('Experiment B via colon');
    });
  });
});
