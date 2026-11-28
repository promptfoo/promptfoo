import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsvFromSharepoint } from '../../src/microsoftSharepoint';
import {
  readStandaloneTestsFile,
  readTestConfigs,
  readTests,
  resolveTestsWatchPaths,
} from '../../src/util/testCaseReader';

vi.mock('../../src/microsoftSharepoint', () => ({
  fetchCsvFromSharepoint: vi.fn(),
}));

describe('remote test sources with data-looking extensions', () => {
  const urls = [
    'https://example.sharepoint.com/sites/team/cases.YAML',
    'https://example.sharepoint.com/:x:/r/sites/team/cases.YML',
    'https://example.sharepoint.com/sites/team/cases.YaMl',
    'https://example.sharepoint.com/:x:/r/sites/team/cases.YmL',
    'https://example.sharepoint.com/sites/team/cases.csv?filename=cases.YAML',
  ];
  const readers = { readTests, readTestConfigs };
  const rows = [
    { value: 'first', reference: 'file://not-a-local-reference.yaml', __expected: 'first' },
    { value: 'second', reference: 'file://not-a-local-reference.yaml', __expected: 'second' },
  ];

  beforeEach(() => {
    vi.mocked(fetchCsvFromSharepoint).mockResolvedValue(rows);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const expectRemoteRows = (tests: Awaited<ReturnType<typeof readTests>>) => {
    expect(tests).toHaveLength(2);
    expect(tests.map((test) => test.vars)).toEqual([
      { value: 'first', reference: 'file://not-a-local-reference.yaml' },
      { value: 'second', reference: 'file://not-a-local-reference.yaml' },
    ]);
    expect(tests.map((test) => test.metadata?.__promptfoo?.remote)).toEqual([true, true]);
  };

  for (const [readerName, read] of Object.entries(readers)) {
    it.each(urls)(readerName + ' retains scalar SharePoint handling for %s', async (url) => {
      expectRemoteRows(await read(url));
      expect(fetchCsvFromSharepoint).toHaveBeenCalledExactlyOnceWith(url);
      expect(resolveTestsWatchPaths(url)).toEqual([]);
    });

    it.each(['array', 'object'] as const)(
      readerName + ' retains %s source handling',
      async (shape) => {
        const url = urls[1];
        const source = shape === 'array' ? [url] : { path: url };
        expectRemoteRows(await read(source));
        expect(fetchCsvFromSharepoint).toHaveBeenCalledExactlyOnceWith(url);
        expect(resolveTestsWatchPaths(source)).toEqual([]);
      },
    );

    it.each(['yaml', 'yml'])(
      readerName + ' preserves existing lowercase remote .%s routing',
      async (extension) => {
        const url = 'https://example.sharepoint.com/sites/team/cases.' + extension;
        await expect(read(url)).rejects.toThrow('No test files found for path:');
        expect(fetchCsvFromSharepoint).not.toHaveBeenCalled();
        expect(resolveTestsWatchPaths(url)).toEqual([]);
      },
    );
  }

  it.each(urls.slice(0, 2))('retains direct standalone handling for %s', async (url) => {
    expectRemoteRows(await readStandaloneTestsFile(url));
    expect(fetchCsvFromSharepoint).toHaveBeenCalledExactlyOnceWith(url);
  });
});
