import fs from 'fs/promises';
import path from 'path';

import confirm from '@inquirer/confirm';
import select from '@inquirer/select';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as init from '../../src/commands/init';
import logger from '../../src/logger';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { createMockResponse } from '../util/utils';

vi.mock('../../src/redteam/commands/init', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    redteamInit: vi.fn(),
  };
});

vi.mock('../../src/server/server', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    startServer: vi.fn(),

    BrowserBehavior: {
      ASK: 0,
      OPEN: 1,
      SKIP: 2,
      OPEN_TO_REPORT: 3,
      OPEN_TO_REDTEAM_CREATE: 4,
    },
  };
});

vi.mock('../../src/util/fetch/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithProxy: vi.fn(),
  };
});

vi.mock('fs/promises');
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('path', async () => ({
  ...(await vi.importActual('path')),
  resolve: vi.fn(),
}));
vi.mock('../../src/constants');
vi.mock('../../src/onboarding');
vi.mock('../../src/telemetry');
vi.mock('@inquirer/confirm');
vi.mock('@inquirer/input');
vi.mock('@inquirer/select');

const mockFetchWithProxy = vi.mocked(fetchWithProxy);

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithProxy.mockReset();
    vi.mocked(confirm).mockReset();
    vi.mocked(select).mockReset();
    vi.mocked(fs.access).mockReset();
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.rm).mockReset();
    vi.mocked(fs.writeFile).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('downloadFile', () => {
    it('should download a file successfully', async () => {
      const mockResponse = createMockResponse({
        ok: true,
        status: 200,
        text: () => Promise.resolve('file content'),
      });
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await init.downloadFile('https://example.com/file.txt', '/path/to/file.txt');

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/file.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('/path/to/file.txt', 'file content');
    });

    it('should throw an error if download fails', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await expect(
        init.downloadFile('https://example.com/file.txt', '/path/to/file.txt'),
      ).rejects.toThrow('Failed to download file: Not Found');
    });

    it('should handle network errors', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      await expect(
        init.downloadFile('https://example.com/file.txt', '/path/to/file.txt'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('downloadDirectory', () => {
    it.each(
      ['github-models', 'provider-github-models'].flatMap((root) => [
        root,
        `${root}/nested`,
        `./${root}`,
        `config-js/../${root}`,
        `.\\${root}`,
        `config-js\\..\\${root}`,
        `./${root}/nested`,
      ]),
    )('rejects unsupported example %s before fetching directory contents', async (example) => {
      mockFetchWithProxy.mockResolvedValue(createMockResponse({ json: () => Promise.resolve([]) }));

      await expect(init.downloadDirectory(example, '/path/to/target', ['0.122.2'])).rejects.toThrow(
        'GitHub Models has been retired',
      );
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it.each([
      ['config-js', 'config-js'],
      ['./config-js', 'config-js'],
      ['provider-http/../config-js', 'config-js'],
      ['provider-github-models/../config-js', 'config-js'],
      ['provider-http/basic', 'provider-http/basic'],
      ['provider-http\\basic', 'provider-http/basic'],
    ])('downloads supported effective path %s', async (example, effectivePath) => {
      const contentsPath = `/repos/promptfoo/promptfoo/contents/examples/${effectivePath}`;
      const fileUrl = 'https://example.com/promptfooconfig.yaml';
      const config = 'description: supported example';
      mockFetchWithProxy.mockImplementation(async (input) => {
        const url = new URL(input.toString());
        if (url.origin === 'https://api.github.com' && url.pathname === contentsPath) {
          expect(url.searchParams.get('ref')).toBe('0.122.2');
          return createMockResponse({
            json: () =>
              Promise.resolve([
                { type: 'file', name: 'promptfooconfig.yaml', download_url: fileUrl },
              ]),
          });
        }
        if (url.href === fileUrl) {
          return createMockResponse({ text: () => Promise.resolve(config) });
        }
        throw new Error(`Unexpected example request: ${url}`);
      });

      await init.downloadDirectory(example, '/path/to/target', ['0.122.2']);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('/path/to/target', 'promptfooconfig.yaml'),
        config,
      );
    });

    it.each([
      '%70rovider-github-models',
      '%67ithub-models',
      '%70rovider-github-models%2FREADME.md',
      '%67ithub-models%2Fnested',
    ])('rejects encoded retired example %s before requesting contents', async (example) => {
      mockFetchWithProxy.mockResolvedValue(createMockResponse({ json: () => Promise.resolve([]) }));

      await expect(init.downloadDirectory(example, '/path/to/target', ['0.122.2'])).rejects.toThrow(
        'GitHub Models has been retired',
      );
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('downloads a supported encoded example without rewriting its request path', async () => {
      const fileUrl = 'https://example.com/promptfooconfig.yaml';
      mockFetchWithProxy
        .mockResolvedValueOnce(
          createMockResponse({
            json: () =>
              Promise.resolve([
                { type: 'file', name: 'promptfooconfig.yaml', download_url: fileUrl },
              ]),
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({ text: () => Promise.resolve('description: encoded example') }),
        );

      await init.downloadDirectory('%63onfig-js', '/path/to/target', ['0.122.2']);

      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(
        1,
        'https://api.github.com/repos/promptfoo/promptfoo/contents/examples/%63onfig-js?ref=0.122.2',
        expect.any(Object),
      );
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('/path/to/target', 'promptfooconfig.yaml'),
        'description: encoded example',
      );
    });

    it('should throw an error if fetching directory contents fails on both VERSION and main', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        statusText: 'Not Found',
      });
      mockFetchWithProxy.mockResolvedValueOnce(mockResponse).mockResolvedValueOnce(mockResponse);

      await expect(init.downloadDirectory('example', '/path/to/target')).rejects.toThrow(
        'Failed to fetch directory contents for refs:',
      );

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(mockFetchWithProxy.mock.calls[0][0]).toContain('?ref=');
      expect(mockFetchWithProxy.mock.calls[1][0]).toContain('?ref=main');
    });

    it('should succeed if VERSION fails but main succeeds', async () => {
      const mockFailedResponse = createMockResponse({
        ok: false,
        statusText: 'Not Found',
      });

      const mockSuccessResponse = createMockResponse({
        ok: true,
        json: () => Promise.resolve([]),
      });

      mockFetchWithProxy
        .mockResolvedValueOnce(mockFailedResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      await init.downloadDirectory('example', '/path/to/target');

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(mockFetchWithProxy.mock.calls[0][0]).toContain('?ref=');
      expect(mockFetchWithProxy.mock.calls[1][0]).toContain('?ref=main');
    });

    it('should handle network errors', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      await expect(init.downloadDirectory('example', '/path/to/target')).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('downloadExample', () => {
    it('should throw an error if directory creation fails', async () => {
      vi.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Permission denied'));

      await expect(init.downloadExample('example', '/path/to/target')).rejects.toThrow(
        'Failed to download example: Permission denied',
      );
    });

    it('should throw an error if downloadDirectory fails', async () => {
      vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);

      // Mock fetch to simulate downloadDirectory failure
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      await expect(init.downloadExample('example', '/path/to/target')).rejects.toThrow(
        'Failed to download example: Network error',
      );
    });
  });

  describe('getExamplesList', () => {
    it.each([
      false,
      true,
    ])('excludes unsupported examples from discovery (VERSION unavailable=%s)', async (versionUnavailable) => {
      if (versionUnavailable) {
        mockFetchWithProxy.mockResolvedValueOnce(
          createMockResponse({ ok: false, status: 404, statusText: 'Not Found' }),
        );
      }
      mockFetchWithProxy.mockResolvedValueOnce(
        createMockResponse({
          json: () =>
            Promise.resolve({
              tree: [
                { path: 'examples/provider-github-models/promptfooconfig.yaml', type: 'blob' },
                { path: 'examples/github-models/promptfooconfig.yaml', type: 'blob' },
                {
                  path: 'examples/provider-github-models/nested/promptfooconfig.yaml',
                  type: 'blob',
                },
                { path: 'examples/config-js/promptfooconfig.js', type: 'blob' },
                { path: 'examples/provider-http/basic/promptfooconfig.yaml', type: 'blob' },
              ],
            }),
        }),
      );

      expect(await init.getExamplesList()).toEqual(['config-js', 'provider-http/basic']);
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(versionUnavailable ? 2 : 1);
    });

    it('should return a list of examples', async () => {
      const mockResponse = createMockResponse({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tree: [
              { path: 'examples/provider-http/basic/promptfooconfig.yaml', type: 'blob' },
              { path: 'examples/provider-http/README.md', type: 'blob' },
              { path: 'examples/eval-json-output/promptfooconfig.yaml', type: 'blob' },
              { path: 'examples/provider-http/basic/server.js', type: 'blob' },
            ],
          }),
      });
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const examples = await init.getExamplesList();

      expect(examples).toEqual(['eval-json-output', 'provider-http/basic']);
    });

    it('should fall back to main when VERSION tree request fails', async () => {
      const mockVersionFailure = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      const mockMainSuccess = createMockResponse({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tree: [{ path: 'examples/config-js/promptfooconfig.js', type: 'blob' }],
          }),
      });

      mockFetchWithProxy
        .mockResolvedValueOnce(mockVersionFailure)
        .mockResolvedValueOnce(mockMainSuccess);

      const examples = await init.getExamplesList();

      expect(examples).toEqual(['config-js']);
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(mockFetchWithProxy.mock.calls[1][0]).toContain('/git/trees/main?recursive=1');
    });

    it('should return an empty array if fetching fails', async () => {
      const mockVersionFailure = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      const mockMainFailure = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      mockFetchWithProxy
        .mockResolvedValueOnce(mockVersionFailure)
        .mockResolvedValueOnce(mockMainFailure);

      const examples = await init.getExamplesList();

      expect(examples).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Not Found'));
    });

    it('should handle network errors', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      const examples = await init.getExamplesList();

      expect(examples).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });
  });

  describe('handleExampleDownload', () => {
    it.each([
      [false, true],
      [false, false],
      [true, true],
      [true, false],
    ])('preserves literal backslashes in advice (runnable=%s, README=%s)', async (runnable, readme) => {
      const directory = 'workspace\\branch';
      const example = 'provider-http\\basic';
      const examplePath = path.join(directory, example);
      const readmePath = path.join(examplePath, 'README.md');
      const entries = [
        ...(runnable ? ['promptfooconfig.yaml'] : []),
        ...(readme ? ['README.md'] : []),
      ];
      mockFetchWithProxy.mockImplementation(async (input) =>
        input.toString().startsWith('https://api.github.com/')
          ? createMockResponse({
              json: () =>
                Promise.resolve(
                  entries.map((name) => ({
                    type: 'file',
                    name,
                    download_url: `https://example.com/${name}`,
                  })),
                ),
            })
          : createMockResponse({ text: () => Promise.resolve('harmless example content') }),
      );
      vi.mocked(fs.readdir).mockResolvedValue(
        entries as unknown as Awaited<ReturnType<typeof fs.readdir>>,
      );
      vi.mocked(fs.access).mockImplementation(async (target) => {
        if (target.toString() === readmePath && !readme) {
          throw new Error('ENOENT');
        }
      });

      expect(await init.handleExampleDownload(directory, example)).toBe(example);

      const advice = vi
        .mocked(logger.info)
        .mock.calls.map(([message]) => String(message))
        .find((message) => message.includes('to get started'));
      expect(advice).toBeDefined();
      if (readme) {
        expect(advice).toContain(readmePath);
      } else {
        expect(advice).toContain(
          `https://github.com/promptfoo/promptfoo/tree/main/examples/${example}`,
        );
      }
      if (runnable) {
        expect(advice).toContain(`cd ${examplePath} && promptfoo eval`);
      }
      expect(advice).not.toContain('\u0008');
      expect(fs.writeFile).toHaveBeenCalledTimes(entries.length);
    });

    it('preserves ordinary retry behavior for a malformed percent escape', async () => {
      mockFetchWithProxy.mockResolvedValue(
        createMockResponse({ ok: false, status: 404, statusText: 'Not Found' }),
      );
      vi.mocked(confirm).mockResolvedValue(false);

      expect(await init.handleExampleDownload('.', 'config-%ZZ')).toBe('config-%ZZ');

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      for (const [url] of mockFetchWithProxy.mock.calls) {
        expect(url.toString()).toContain('/contents/examples/config-%ZZ?ref=');
      }
      expect(confirm).toHaveBeenCalledOnce();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch directory contents for refs:'),
      );
    });

    describe('alias resolution', () => {
      it('should resolve old example name to new name via EXAMPLE_ALIASES', async () => {
        // Download will fail, but we're testing alias resolution, not download
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        vi.mocked(confirm).mockResolvedValue(false);

        await init.handleExampleDownload('.', 'custom-provider');

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("'custom-provider' has been renamed to 'provider-custom/basic'"),
        );
      });

      it('should pass through unknown example names without logging rename message', async () => {
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        vi.mocked(confirm).mockResolvedValue(false);

        await init.handleExampleDownload('.', 'some-unknown-example');

        expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('has been renamed'));
      });

      it('should show replacement messaging for removed examples', async () => {
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        vi.mocked(confirm).mockResolvedValue(false);

        await init.handleExampleDownload('.', 'dbrx-benchmark');

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('dbrx-benchmark was removed because DBRX is no longer available'),
        );
      });

      it('should download using the resolved alias name', async () => {
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        vi.mocked(confirm).mockResolvedValue(false);

        const result = await init.handleExampleDownload('.', 'custom-provider');

        // The resolved name should be used, not the alias
        expect(result).toEqual('provider-custom/basic');
      });

      it('should map legacy root slugs to runnable subdirectory examples', async () => {
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        vi.mocked(confirm).mockResolvedValue(false);

        const amazonBedrockResult = await init.handleExampleDownload('.', 'amazon-bedrock');
        const xaiResult = await init.handleExampleDownload('.', 'xai');
        const openSourceResult = await init.handleExampleDownload('.', 'open-source-comparison');
        const opencodeResult = await init.handleExampleDownload('.', 'opencode-sdk');

        expect(amazonBedrockResult).toEqual('amazon-bedrock/models');
        expect(xaiResult).toEqual('xai/chat');
        expect(openSourceResult).toEqual('compare-open-source-models');
        expect(opencodeResult).toEqual('provider-opencode-sdk/basic');
      });

      it('should preserve legacy GPT model comparison example names', async () => {
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        vi.mocked(confirm).mockResolvedValue(false);

        const legacyFolderResult = await init.handleExampleDownload(
          '.',
          'compare-gpt-4o-vs-4o-mini',
        );
        const legacyAliasResult = await init.handleExampleDownload('.', 'gpt-4o-vs-4o-mini');
        const legacyMmluResult = await init.handleExampleDownload(
          '.',
          'compare-gpt-5-vs-gpt-5-mini-mmlu',
        );
        const agnosticMmluAliasResult = await init.handleExampleDownload(
          '.',
          'compare-gpt-mmlu-pro',
        );
        const shortMmluAliasResult = await init.handleExampleDownload('.', 'gpt-mmlu-pro');
        const modelTiersMmluAliasResult = await init.handleExampleDownload(
          '.',
          'gpt-model-tiers-mmlu-pro',
        );

        expect(legacyFolderResult).toEqual('compare-gpt-model-tiers');
        expect(legacyAliasResult).toEqual('compare-gpt-model-tiers');
        expect(legacyMmluResult).toEqual('compare-gpt-model-tiers-mmlu-pro');
        expect(agnosticMmluAliasResult).toEqual('compare-gpt-model-tiers-mmlu-pro');
        expect(shortMmluAliasResult).toEqual('compare-gpt-model-tiers-mmlu-pro');
        expect(modelTiersMmluAliasResult).toEqual('compare-gpt-model-tiers-mmlu-pro');
      });

      it('should use legacy ref for removed examples', async () => {
        const mockFailure = createMockResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });
        mockFetchWithProxy.mockResolvedValue(mockFailure);
        vi.mocked(confirm).mockResolvedValue(false);

        const result = await init.handleExampleDownload('.', 'assistant-cli');

        expect(result).toEqual('assistant-cli');
        expect(mockFetchWithProxy.mock.calls[0][0]).toContain(
          '/repos/promptfoo/promptfoo/contents/examples/assistant-cli?ref=0.120.26',
        );
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('assistant-cli was removed'),
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("legacy 'assistant-cli' example from promptfoo@0.120.26"),
        );
      });

      it.each([
        'openai-deep-research',
        'redteam-dalle',
      ])('pins the historical OpenAI example %s and warns it cannot run on the current API', async (example) => {
        mockFetchWithProxy.mockResolvedValue(
          createMockResponse({ ok: false, status: 404, statusText: 'Not Found' }),
        );
        vi.mocked(confirm).mockResolvedValue(false);

        expect(await init.handleExampleDownload('.', example)).toBe(example);
        expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
        expect(mockFetchWithProxy.mock.calls[0][0]).toContain(
          `/repos/promptfoo/promptfoo/contents/examples/${example}?ref=31b566872971532e6d428c0cbad4487d22d936c5`,
        );
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('cannot run against the current OpenAI API'),
        );
      });

      it('should reset to default refs when retrying after legacy example failure', async () => {
        const mockLegacyFailure = createMockResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });
        const mockTreeResponse = createMockResponse({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              tree: [{ path: 'examples/provider-http/basic/promptfooconfig.yaml', type: 'blob' }],
            }),
        });
        const mockDefaultRefFailure = createMockResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });
        const mockMainRefSuccess = createMockResponse({
          ok: true,
          json: () => Promise.resolve([]),
        });

        mockFetchWithProxy
          .mockResolvedValueOnce(mockLegacyFailure)
          .mockResolvedValueOnce(mockTreeResponse)
          .mockResolvedValueOnce(mockDefaultRefFailure)
          .mockResolvedValueOnce(mockMainRefSuccess);

        vi.mocked(confirm).mockResolvedValue(true);
        vi.mocked(select).mockResolvedValue('provider-http/basic');
        vi.spyOn(fs, 'readdir').mockResolvedValue([]);

        await init.handleExampleDownload('.', 'assistant-cli');

        expect(mockFetchWithProxy.mock.calls[2][0]).toContain(
          '/contents/examples/provider-http/basic?ref=',
        );
        expect(mockFetchWithProxy.mock.calls[3][0]).toContain(
          '/contents/examples/provider-http/basic?ref=main',
        );
      });

      it('should provide docs URL when selected subdirectory example has no local readme', async () => {
        const mockTreeResponse = createMockResponse({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              tree: [
                { path: 'examples/provider-opencode-sdk/basic/promptfooconfig.yaml', type: 'blob' },
              ],
            }),
        });
        const mockDirectoryResponse = createMockResponse({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                download_url: 'https://example.com/promptfooconfig.yaml',
                name: 'promptfooconfig.yaml',
                type: 'file',
              },
            ]),
        });
        const mockFileResponse = createMockResponse({
          ok: true,
          text: () => Promise.resolve('description: test'),
        });

        mockFetchWithProxy.mockImplementation(async (url) => {
          const requestUrl = url.toString();
          if (requestUrl.includes('/git/trees/')) {
            return mockTreeResponse;
          }
          if (requestUrl.includes('/contents/examples/provider-opencode-sdk/basic')) {
            return mockDirectoryResponse;
          }
          if (requestUrl === 'https://example.com/promptfooconfig.yaml') {
            return mockFileResponse;
          }
          return createMockResponse({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          });
        });

        vi.mocked(select).mockResolvedValue('provider-opencode-sdk/basic');
        vi.spyOn(fs, 'readdir').mockResolvedValue(['promptfooconfig.yaml'] as unknown as Awaited<
          ReturnType<typeof fs.readdir>
        >);
        vi.spyOn(fs, 'access').mockImplementation(async (targetPath) => {
          if (targetPath.toString().endsWith('README.md')) {
            throw new Error('ENOENT');
          }
        });

        await init.handleExampleDownload('.', true);

        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Example docs:'));
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining(
            'https://github.com/promptfoo/promptfoo/tree/main/examples/provider-opencode-sdk/basic',
          ),
        );
      });
    });

    describe('when download fails', () => {
      it('should not show success message when user declines retry', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        const loggerSpy = vi.spyOn(logger, 'info');

        const result = await init.handleExampleDownload('.', 'nonexistent-example');

        expect(result).toEqual('nonexistent-example');

        expect(loggerSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('cd nonexistent-example && promptfoo eval'),
        );
      });

      it('should show helpful message when user declines retry', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        const loggerSpy = vi.spyOn(logger, 'info');

        const result = await init.handleExampleDownload('.', 'nonexistent-example');

        expect(result).toEqual('nonexistent-example');

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('No example downloaded'));
      });

      it('should not clean up directory when it existed before', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        // Directory exists before download
        vi.spyOn(fs, 'access').mockResolvedValue(undefined);
        // Mock successful cleanup
        const rmSpy = vi.spyOn(fs, 'rm').mockResolvedValue(undefined);

        await init.handleExampleDownload('.', 'nonexistent-example');

        // Should not clean up the directory
        expect(rmSpy).not.toHaveBeenCalledWith('nonexistent-example', {
          recursive: true,
          force: true,
        });
      });

      it('should clean up directory when it did not exist before', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        // Directory doesn't exist before download (fs.access throws)
        vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT: no such file or directory'));
        // Mock successful cleanup
        const rmSpy = vi.spyOn(fs, 'rm').mockResolvedValue(undefined);

        await init.handleExampleDownload('.', 'nonexistent-example');

        // Should clean up the directory
        expect(rmSpy).toHaveBeenCalledWith('nonexistent-example', { recursive: true, force: true });
      });
    });
  });

  describe('initCommand', () => {
    let program: Command;

    beforeEach(() => {
      program = new Command();
      init.initCommand(program);
      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      if (!initCmd) {
        throw new Error('initCmd not found');
      }
    });

    it.each([
      'github-models',
      'provider-github-models',
      './provider-github-models',
      'config-js/../provider-github-models',
      '.\\provider-github-models',
      'config-js\\..\\provider-github-models',
      '%70rovider-github-models',
      '%67ithub-models',
      '%70rovider-github-models%2FREADME.md',
      '%67ithub-models%2Fnested',
    ])('reports unsupported example %s as a failed init without download or retry', async (example) => {
      const previousExitCode = process.exitCode;
      mockFetchWithProxy.mockResolvedValue(createMockResponse({ json: () => Promise.resolve([]) }));

      try {
        await program.parseAsync(['init', '--example', example, '--no-interactive'], {
          from: 'user',
        });

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('GitHub Models has been retired'),
        );
        expect(process.exitCode).toBe(1);
        expect(mockFetchWithProxy).not.toHaveBeenCalled();
        expect(confirm).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('written to:'));
        expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('promptfoo eval'));
      } finally {
        process.exitCode = previousExitCode;
      }
    });

    it('should set up the init command correctly', () => {
      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      expect(initCmd).toBeDefined();
      expect(initCmd?.description()).toBe(
        'Set up a new promptfoo project with prompts, providers, and test cases',
      );
      expect(initCmd?.options).toHaveLength(2);
    });
  });
});
