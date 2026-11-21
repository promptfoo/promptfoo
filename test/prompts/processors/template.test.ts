import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processTemplateFile } from '../../../src/prompts/processors/text';

vi.mock('fs');

const jinjaContent =
  'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
const markdownContent = '# Heading\n\nThis is some markdown content.';
const longMarkdownContent = '# ' + 'A'.repeat(100);
const complexJinjaContent = `
    {% if condition %}
      Handle {{ variable1 }} with condition
    {% else %}
      Handle {{ variable2 }} without condition
    {% endif %}
    `;

const mockReadFileSync = vi.mocked(fs.readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

function expectTemplate(
  filePath: string,
  content: string,
  expected: { label: string; config?: unknown },
  options: Parameters<typeof processTemplateFile>[1] = {},
) {
  mockReadFileSync.mockReturnValue(content);
  expect(processTemplateFile(filePath, options)).toEqual([{ raw: content, ...expected }]);
  expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
}

function expectReadError(filePath: string) {
  mockReadFileSync.mockImplementation(() => {
    throw new Error('File not found');
  });

  expect(() => processTemplateFile(filePath, {})).toThrow('File not found');
  expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
}

describe('processJinjaFile', () => {
  it('should process a Jinja2 file without a label', () => {
    expectTemplate('template.j2', jinjaContent, {
      label: `template.j2: ${jinjaContent.slice(0, 50)}...`,
      config: undefined,
    });
  });

  it('should process a Jinja2 file with a label', () => {
    expectTemplate(
      'template.j2',
      jinjaContent,
      {
        label: 'Custom Label',
        config: undefined,
      },
      { label: 'Custom Label' },
    );
  });

  it('should include config when provided', () => {
    const config = { temperature: 0.7, max_tokens: 150 };
    expectTemplate(
      'template.j2',
      jinjaContent,
      {
        label: `template.j2: ${jinjaContent.slice(0, 50)}...`,
        config,
      },
      { config },
    );
  });

  it('should throw an error if the file cannot be read', () => {
    expectReadError('nonexistent.j2');
  });

  it('should handle variable interpolation syntax properly', () => {
    expectTemplate('complex.j2', complexJinjaContent, {
      label: `complex.j2: ${complexJinjaContent.slice(0, 50)}...`,
      config: undefined,
    });
  });
});

describe('processMarkdownFile', () => {
  it('should process a valid Markdown file without a label', () => {
    expectTemplate('file.md', markdownContent, {
      label: 'file.md: # Heading\n\nThis is some markdown content....',
    });
  });

  it('should process a valid Markdown file with a label', () => {
    expectTemplate(
      'file.md',
      markdownContent,
      { label: 'Custom Label' },
      { label: 'Custom Label' },
    );
  });

  it('should truncate the label for long Markdown files', () => {
    expectTemplate('file.md', longMarkdownContent, { label: `file.md: # ${'A'.repeat(48)}...` });
  });

  it('should throw an error if the file cannot be read', () => {
    expectReadError('nonexistent.md');
  });
});
