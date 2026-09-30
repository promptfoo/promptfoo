import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processDiff } from '../../../src/codeScan/git/diffProcessor';

const mockExeca = vi.hoisted(() => vi.fn());

vi.mock('execa', () => ({
  execa: mockExeca,
}));

describe('processDiff', () => {
  beforeEach(() => {
    mockExeca.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('skips newly recognized binary formats from binary-extensions 3.2.0', async () => {
    // .dylib is already denylisted and .sqlite is explicitly treated as text.
    const extensions = ['dds', 'msi', 'msp', 'p12', 'pfx', 'sqlite3', 'wasm'];
    const files = extensions.map((extension, index) => ({
      path: `fixture.${extension}`,
      sha: `${index + 1}`.repeat(40),
    }));
    const rawDiff = files
      .flatMap(({ path, sha }) => [`:000000 100644 ${'0'.repeat(40)} ${sha} A`, path])
      .concat('')
      .join('\0');
    const numstat = files.map(({ path }) => `1\t0\t${path}`).join('\n');
    const blobSizes = files.map(({ sha }) => `${sha} blob 4`).join('\n');

    mockExeca
      .mockResolvedValueOnce({ stdout: rawDiff })
      .mockResolvedValueOnce({ stdout: numstat })
      .mockResolvedValueOnce({ stdout: blobSizes });

    const result = await processDiff('/repo', 'base', 'head');

    expect(result).toHaveLength(extensions.length);
    expect(result).toEqual(
      files.map(({ path }) =>
        expect.objectContaining({
          path,
          isText: false,
          skipReason: 'binary',
        }),
      ),
    );
    expect(mockExeca).toHaveBeenCalledTimes(3);
    expect(mockExeca).toHaveBeenNthCalledWith(
      1,
      'git',
      ['diff', '--raw', '-z', '--no-color', '--no-ext-diff', '--no-abbrev', 'base...head'],
      { cwd: '/repo' },
    );
    expect(mockExeca).toHaveBeenNthCalledWith(2, 'git', ['diff', '--numstat', 'base...head'], {
      cwd: '/repo',
    });
    expect(mockExeca).toHaveBeenNthCalledWith(
      3,
      'git',
      ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      {
        cwd: '/repo',
        input: files.map(({ sha }) => sha).join('\n'),
      },
    );
  });
});
