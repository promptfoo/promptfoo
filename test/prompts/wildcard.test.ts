import { processPrompts } from '../../src/prompts';

// Mock the python execution
jest.mock('../../src/python/pythonUtils', () => ({
  runPython: jest.fn((filePath: string, functionName: string, args: string[]) => {
    // Return different responses based on file path
    if (filePath.includes('marketing')) {
      return Promise.resolve(
        JSON.stringify({
          output: `Marketing prompt from ${filePath}`,
        }),
      );
    } else if (filePath.includes('technical')) {
      return Promise.resolve(
        JSON.stringify({
          output: `Technical prompt from ${filePath}`,
        }),
      );
    }
    return Promise.resolve(
      JSON.stringify({
        output: 'Default prompt response',
      }),
    );
  }),
}));

// Mock fs operations
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn((path: string) => {
    if (path.includes('.py')) {
      return 'def get_prompt(context):\n    return "Test prompt"';
    }
    if (path.includes('.js')) {
      return 'module.exports = function() { return "JS prompt"; };';
    }
    return '';
  }),
  statSync: jest.fn(() => ({
    size: 1000,
    isDirectory: () => false,
  })),
}));

// Mock glob results
jest.mock('glob', () => ({
  globSync: jest.fn((pattern: string) => {
    if (pattern.includes('test/prompts/**/*.py')) {
      return [
        'test/prompts/marketing/email.py',
        'test/prompts/marketing/social.py',
        'test/prompts/technical/review.py',
      ];
    }
    if (pattern.includes('test/prompts/**/*.js')) {
      return ['test/prompts/ui/button.js', 'test/prompts/ui/form.js'];
    }
    return [];
  }),
}));

// Mock importModule for JavaScript files
jest.mock('../../src/esm', () => ({
  importModule: jest.fn((filePath: string) => {
    return Promise.resolve(function (context: any) {
      return `JS prompt from ${filePath}`;
    });
  }),
}));

describe('Wildcard prompt support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Python wildcards', () => {
    it('should expand wildcard patterns and preserve function names', async () => {
      const prompts = await processPrompts(['file://test/prompts/**/*.py:get_prompt']);

      // Should create one prompt for each matched file
      expect(prompts.length).toBe(3);

      // Each prompt should have the function name preserved
      prompts.forEach((prompt) => {
        expect(prompt.label).toMatch(/\.py:get_prompt$/);
      });
    });

    it('should work without function names', async () => {
      const prompts = await processPrompts(['file://test/prompts/**/*.py']);

      expect(prompts.length).toBe(3);

      // For Python files without function names, labels include file content
      prompts.forEach((prompt) => {
        expect(prompt.label).toContain('.py: ');
      });
    });
  });

  describe('JavaScript wildcards', () => {
    it('should expand wildcard patterns for JavaScript files', async () => {
      const prompts = await processPrompts(['file://test/prompts/**/*.js']);

      expect(prompts.length).toBe(2);

      prompts.forEach((prompt) => {
        expect(prompt.label).toMatch(/\.js$/);
      });
    });

    it('should preserve function names for JavaScript', async () => {
      const prompts = await processPrompts(['file://test/prompts/**/*.js:myFunction']);

      expect(prompts.length).toBe(2);

      prompts.forEach((prompt) => {
        expect(prompt.label).toMatch(/\.js:myFunction$/);
      });
    });
  });

  describe('Mixed patterns', () => {
    it('should handle both wildcards and explicit paths', async () => {
      // Mock for the explicit path
      const fs = require('fs');
      fs.existsSync.mockImplementation((path: string) => {
        if (path.includes('explicit.py')) {
          return true;
        }
        return true;
      });

      const prompts = await processPrompts([
        'file://test/prompts/**/*.py:get_prompt',
        'file://test/explicit.py:another_function',
      ]);

      // 3 from wildcard + 1 explicit
      expect(prompts.length).toBe(4);
    });
  });
});
