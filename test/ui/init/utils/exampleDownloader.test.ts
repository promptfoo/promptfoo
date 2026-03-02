import * as fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadExample,
  fetchExampleList,
  getExampleDescription,
} from '../../../../src/ui/init/utils/exampleDownloader';
import { fetchWithProxy } from '../../../../src/util/fetch';

// Mock dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/util/fetch', () => ({
  fetchWithProxy: vi.fn(),
}));

describe('fetchExampleList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch and return list of example directories', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue([
        { name: 'openai-chat', type: 'dir' },
        { name: 'anthropic', type: 'dir' },
        { name: 'README.md', type: 'file' },
      ]),
    };
    vi.mocked(fetchWithProxy).mockResolvedValue(mockResponse as unknown as Response);

    const result = await fetchExampleList();

    expect(result).toEqual(['anthropic', 'openai-chat']);
    expect(fetchWithProxy).toHaveBeenCalledWith(
      expect.stringContaining('/contents/examples'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github.v3+json',
        }),
      }),
    );
  });

  it('should throw error when fetch fails', async () => {
    const mockResponse = {
      ok: false,
      statusText: 'Not Found',
    };
    vi.mocked(fetchWithProxy).mockResolvedValue(mockResponse as unknown as Response);

    await expect(fetchExampleList()).rejects.toThrow('Failed to fetch examples');
  });

  it('should filter out non-directory items', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue([
        { name: 'example1', type: 'dir' },
        { name: 'file.txt', type: 'file' },
        { name: 'example2', type: 'dir' },
        { name: 'another.md', type: 'file' },
      ]),
    };
    vi.mocked(fetchWithProxy).mockResolvedValue(mockResponse as unknown as Response);

    const result = await fetchExampleList();

    expect(result).toEqual(['example1', 'example2']);
  });

  it('should return sorted list', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue([
        { name: 'zebra', type: 'dir' },
        { name: 'alpha', type: 'dir' },
        { name: 'beta', type: 'dir' },
      ]),
    };
    vi.mocked(fetchWithProxy).mockResolvedValue(mockResponse as unknown as Response);

    const result = await fetchExampleList();

    expect(result).toEqual(['alpha', 'beta', 'zebra']);
  });
});

describe('downloadExample', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  it('should download all files in an example', async () => {
    // Mock fetching example file list
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).includes('/contents/examples/test-example')) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue([
            { name: 'config.yaml', type: 'file', path: 'examples/test-example/config.yaml' },
            { name: 'README.md', type: 'file', path: 'examples/test-example/README.md' },
          ]),
        } as unknown as Response;
      }
      // Mock raw file download
      return {
        ok: true,
        text: vi.fn().mockResolvedValue('file content'),
      } as unknown as Response;
    });

    const result = await downloadExample('test-example', '/output');

    expect(result.success).toBe(true);
    expect(result.filesDownloaded).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('should call progress callback', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).includes('/contents/examples/')) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue([
            { name: 'file1.yaml', type: 'file', path: 'examples/test/file1.yaml' },
            { name: 'file2.yaml', type: 'file', path: 'examples/test/file2.yaml' },
          ]),
        } as unknown as Response;
      }
      return {
        ok: true,
        text: vi.fn().mockResolvedValue('content'),
      } as unknown as Response;
    });

    const onProgress = vi.fn();
    await downloadExample('test', '/output', onProgress);

    expect(onProgress).toHaveBeenCalled();
    // Should have progress updates plus final update
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Last call should be 100%
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(lastCall.percentage).toBe(100);
  });

  it('should handle download errors gracefully', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).includes('/contents/examples/')) {
        return {
          ok: true,
          json: vi
            .fn()
            .mockResolvedValue([
              { name: 'file.yaml', type: 'file', path: 'examples/test/file.yaml' },
            ]),
        } as unknown as Response;
      }
      // Fail the file download
      return {
        ok: false,
        statusText: 'Not Found',
      } as unknown as Response;
    });

    const result = await downloadExample('test', '/output');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return error when no files found', async () => {
    vi.mocked(fetchWithProxy).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    } as unknown as Response);

    const result = await downloadExample('empty-example', '/output');

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual({
      file: 'empty-example',
      error: 'No files found in example',
    });
  });

  it('should create target directory if it does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).includes('/contents/examples/')) {
        return {
          ok: true,
          json: vi
            .fn()
            .mockResolvedValue([
              { name: 'file.yaml', type: 'file', path: 'examples/test/file.yaml' },
            ]),
        } as unknown as Response;
      }
      return {
        ok: true,
        text: vi.fn().mockResolvedValue('content'),
      } as unknown as Response;
    });

    await downloadExample('test', '/new-directory');

    expect(fs.mkdirSync).toHaveBeenCalledWith('/new-directory', { recursive: true });
  });

  it('should handle subdirectories in examples', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      const urlStr = String(url);
      // GitHub API call for main example directory
      if (urlStr.includes('api.github.com') && urlStr.endsWith('/contents/examples/test')) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue([
            { name: 'file.yaml', type: 'file', path: 'examples/test/file.yaml' },
            { name: 'subdir', type: 'dir', path: 'examples/test/subdir' },
          ]),
        } as unknown as Response;
      }
      // GitHub API call for subdirectory
      if (urlStr.includes('api.github.com') && urlStr.includes('/contents/examples/test/subdir')) {
        return {
          ok: true,
          json: vi
            .fn()
            .mockResolvedValue([
              { name: 'nested.yaml', type: 'file', path: 'examples/test/subdir/nested.yaml' },
            ]),
        } as unknown as Response;
      }
      // Raw file downloads (from raw.githubusercontent.com)
      return {
        ok: true,
        text: vi.fn().mockResolvedValue('content'),
      } as unknown as Response;
    });

    const result = await downloadExample('test', '/output');

    expect(result.success).toBe(true);
    expect(result.filesDownloaded).toContain('file.yaml');
    expect(result.filesDownloaded).toContain('subdir/nested.yaml');
  });
});

describe('getExampleDescription', () => {
  it('should return exact match description', () => {
    expect(getExampleDescription('openai-chat')).toBe('Basic OpenAI chat completion');
    expect(getExampleDescription('anthropic')).toBe('Anthropic Claude');
  });

  it('should return partial match description', () => {
    expect(getExampleDescription('my-openai-chat-example')).toBe('Basic OpenAI chat completion');
    expect(getExampleDescription('openai-function-calling-advanced')).toBe(
      'OpenAI function/tool calling',
    );
  });

  it('should return pattern-based description for redteam', () => {
    expect(getExampleDescription('my-redteam-test')).toBe('Security/red team testing');
    expect(getExampleDescription('some-red-team-example')).toBe('Security/red team testing');
  });

  it('should return pattern-based description for rag', () => {
    expect(getExampleDescription('custom-rag-example')).toBe('RAG evaluation example');
  });

  it('should return pattern-based description for agent', () => {
    expect(getExampleDescription('my-agent-example')).toBe('Agent evaluation example');
  });

  it('should return pattern-based description for tool', () => {
    expect(getExampleDescription('custom-tool-example')).toBe('Tool use evaluation');
  });

  it('should return fallback description for unknown examples', () => {
    expect(getExampleDescription('completely-unknown-example')).toBe(
      'Promptfoo configuration example',
    );
  });

  it('should handle common provider examples', () => {
    expect(getExampleDescription('azure-openai')).toBe('Azure OpenAI Service');
    expect(getExampleDescription('google-vertex')).toBe('Google Vertex AI');
    expect(getExampleDescription('amazon-bedrock')).toBe('Amazon Bedrock');
    expect(getExampleDescription('ollama')).toBe('Ollama local models');
  });

  it('should handle framework examples', () => {
    expect(getExampleDescription('langchain')).toBe('LangChain integration');
    expect(getExampleDescription('llamaindex')).toBe('LlamaIndex integration');
    expect(getExampleDescription('autogen')).toBe('AutoGen multi-agent');
  });
});
