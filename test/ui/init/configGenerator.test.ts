import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock envars to prevent environment leakage
vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn(),
  getEnvBool: vi.fn(() => false),
}));

describe('configGenerator', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('generateFiles', () => {
    it('should generate promptfooconfig.yaml for compare use case', async () => {
      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['openai:gpt-5-mini', 'openai:gpt-5'],
      });

      const configFile = files.find((f) => f.path === 'promptfooconfig.yaml');
      expect(configFile).toBeDefined();
      expect(configFile?.required).toBe(true);
      expect(configFile?.contents).toContain('prompts:');
      expect(configFile?.contents).toContain('providers:');
      expect(configFile?.contents).toContain('tests:');
    });

    it('should generate README.md', async () => {
      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['openai:gpt-5'],
      });

      const readme = files.find((f) => f.path === 'README.md');
      expect(readme).toBeDefined();
      expect(readme?.required).toBe(false);
      expect(readme?.contents).toContain('promptfoo eval');
    });

    it('should generate Python context file for RAG use case with Python language', async () => {
      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'rag',
        language: 'python',
        providers: ['openai:gpt-5'],
      });

      const contextFile = files.find((f) => f.path === 'context.py');
      expect(contextFile).toBeDefined();
      expect(contextFile?.required).toBe(true);
      expect(contextFile?.contents).toContain('def get_var');
    });

    it('should generate JavaScript context file for RAG use case with JavaScript language', async () => {
      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'rag',
        language: 'javascript',
        providers: ['openai:gpt-5'],
      });

      const contextFile = files.find((f) => f.path === 'context.js');
      expect(contextFile).toBeDefined();
      expect(contextFile?.required).toBe(true);
      expect(contextFile?.contents).toContain('module.exports');
    });

    it('should generate Python provider file for python file:// providers', async () => {
      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['file://provider.py'],
      });

      const providerFile = files.find((f) => f.path === 'provider.py');
      expect(providerFile).toBeDefined();
      expect(providerFile?.required).toBe(true);
      expect(providerFile?.contents).toContain('def call_api');
    });

    it('should generate JavaScript provider file for JS file:// providers', async () => {
      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['file://provider.js'],
      });

      const providerFile = files.find((f) => f.path === 'provider.js');
      expect(providerFile).toBeDefined();
      expect(providerFile?.required).toBe(true);
      expect(providerFile?.contents).toContain('class CustomApiProvider');
    });

    it('should generate shell script for exec: providers on Unix', async () => {
      // Skip on Windows
      if (process.platform === 'win32') {
        return;
      }

      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['exec:provider.sh'],
      });

      const providerFile = files.find((f) => f.path === 'provider.sh');
      expect(providerFile).toBeDefined();
      expect(providerFile?.required).toBe(true);
    });

    it('should generate context file for agent use case', async () => {
      const { generateFiles } = await import('../../../src/ui/init/utils/configGenerator');

      const files = generateFiles({
        useCase: 'agent',
        language: 'python',
        providers: ['openai:gpt-5'],
      });

      const contextFile = files.find((f) => f.path === 'context.py');
      expect(contextFile).toBeDefined();
    });
  });

  describe('generateConfigYaml', () => {
    it('should generate valid YAML for compare use case', async () => {
      const { generateConfigYaml } = await import('../../../src/ui/init/utils/configGenerator');

      const config = generateConfigYaml({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['openai:gpt-5-mini', 'openai:gpt-5'],
      });

      expect(config).toContain('description:');
      expect(config).toContain('prompts:');
      expect(config).toContain('providers:');
      expect(config).toContain('tests:');
      expect(config).toContain('topic: bananas');
    });

    it('should generate config with context for RAG use case', async () => {
      const { generateConfigYaml } = await import('../../../src/ui/init/utils/configGenerator');

      const config = generateConfigYaml({
        useCase: 'rag',
        language: 'python',
        providers: ['openai:gpt-5'],
      });

      expect(config).toContain('inquiry:');
      expect(config).toContain('context:');
      expect(config).toContain('file://context.py');
    });

    it('should use JavaScript assertions for compare use case', async () => {
      const { generateConfigYaml } = await import('../../../src/ui/init/utils/configGenerator');

      const config = generateConfigYaml({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['openai:gpt-5'],
      });

      expect(config).toContain('type: javascript');
      expect(config).toContain('output.length');
    });

    it('should use Python assertions for RAG use case with Python language', async () => {
      const { generateConfigYaml } = await import('../../../src/ui/init/utils/configGenerator');

      const config = generateConfigYaml({
        useCase: 'rag',
        language: 'python',
        providers: ['openai:gpt-5'],
      });

      expect(config).toContain('type: python');
      expect(config).toContain('len(output)');
    });

    it('should include LLM rubric assertion', async () => {
      const { generateConfigYaml } = await import('../../../src/ui/init/utils/configGenerator');

      const config = generateConfigYaml({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['openai:gpt-5'],
      });

      expect(config).toContain('type: llm-rubric');
    });

    it('should include schema reference comment', async () => {
      const { generateConfigYaml } = await import('../../../src/ui/init/utils/configGenerator');

      const config = generateConfigYaml({
        useCase: 'compare',
        language: 'not_sure',
        providers: ['openai:gpt-5'],
      });

      expect(config).toContain('yaml-language-server');
      expect(config).toContain('$schema');
    });
  });
});
