import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_BLOB_SIZE_BYTES } from '../../../src/codeScan/constants/filtering';
import { processDiff } from '../../../src/codeScan/git/diffProcessor';

describe('processDiff with real git blobs', () => {
  let repoPath: string;
  let files: Awaited<ReturnType<typeof processDiff>>;
  const text = 'const message = "scan this text";\n'.repeat(200);
  const unusualPaths = [
    'name\twith-tab.ts',
    'name\nwith-newline.ts',
    'naïve-名.ts',
    'name"quote.ts',
    'name\\backslash.ts',
  ];
  const renamedPath = 'renamed\n名.ts';

  beforeAll(async () => {
    repoPath = await mkdtemp(path.join(tmpdir(), 'promptfoo-diff-text-'));
    const git = async (args: string[], input?: string | Buffer): Promise<string> => {
      const command = promisify(execFile)('git', args, {
        cwd: repoPath,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Diff test',
          GIT_AUTHOR_EMAIL: 'diff-test@example.com',
          GIT_COMMITTER_NAME: 'Diff test',
          GIT_COMMITTER_EMAIL: 'diff-test@example.com',
        },
      });
      command.child.stdin?.end(input);
      return (await command).stdout.trimEnd();
    };

    await git(['init', '--bare', '--template=']);
    await git(['config', 'diff.renames', 'true']);
    await git(['config', 'core.quotePath', 'true']);
    const originalText = Array.from({ length: 100 }, (_, i) => `const value${i} = ${i};\n`).join(
      '',
    );
    const originalBlob = await git(['hash-object', '-w', '--stdin'], originalText);
    const baseTree = await git(['mktree', '-z'], `100644 blob ${originalBlob}\toriginal\t名.ts\0`);
    const base = await git(['commit-tree', baseTree, '-m', 'base']);
    const fixtures = [
      ['known.ts', text],
      ['name with spaces;literal.ts', text],
      ...unusualPaths.map((filename) => [filename, text] as const),
      [renamedPath, originalText.replace('const value0 = 0;', 'const value0 = 100;')],
      ['large-patch.ts', 'line\n'.repeat(45_000)],
      ['unknown.pfaudit', text],
      ['extensionless', text],
      ['binary.pfaudit', Buffer.alloc(8192)],
      ['oversized.pfaudit', Buffer.alloc(MAX_BLOB_SIZE_BYTES + 1, 'a')],
    ] as const;
    // One at a time: several fixtures share their content, and on Windows concurrent writers
    // of the same object fail with "unable to write file ...: Permission denied".
    const entries: string[] = [];
    for (const [filename, data] of fixtures) {
      const hash = await git(['hash-object', '-w', '--stdin'], data);
      entries.push(`100644 blob ${hash}\t${filename}\0`);
    }
    const tree = await git(['mktree', '-z'], entries.join(''));
    const head = await git(['commit-tree', tree, '-p', base, '-m', 'add fixtures']);

    files = await processDiff(repoPath, base, head);
  });

  afterAll(async () => {
    if (repoPath) {
      // Windows can briefly retain a Git working-directory handle after a failed diff.
      await rm(repoPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it.each(['known.ts', 'unknown.pfaudit', 'extensionless', 'name with spaces;literal.ts'])(
    'includes text larger than 4KB in %s',
    (filename) => {
      expect(Buffer.byteLength(text)).toBeGreaterThan(4096);
      expect(files.find((file) => file.path === filename)).toMatchObject({
        isText: true,
        afterSizeBytes: Buffer.byteLength(text),
        patch: expect.stringContaining('scan this text'),
      });
      expect(files.find((file) => file.path === filename)?.skipReason).toBeUndefined();
    },
  );

  it.each(unusualPaths)('preserves line counts for the literal path %j', (filename) => {
    expect(files.find((file) => file.path === filename)).toMatchObject({
      status: 'A',
      linesAdded: 200,
      linesRemoved: 0,
    });
  });

  it('attaches rename line counts to the destination path', () => {
    expect(files.find((file) => file.path === renamedPath)).toMatchObject({
      status: expect.stringMatching(/^R\d+$/),
      linesAdded: 1,
      linesRemoved: 1,
    });
  });

  it('skips a patch above its limit even when its blob fits', () => {
    expect(files.find((file) => file.path === 'large-patch.ts')).toMatchObject({
      isText: true,
      afterSizeBytes: 225_000,
      skipReason: 'patch too large',
    });
  });

  it('reports Git failures for invalid refs', async () => {
    await expect(processDiff(repoPath, 'missing-base', 'missing-head')).rejects.toThrow(
      'Failed to process diff:',
    );
  });

  it('still excludes binary content with an unknown extension', () => {
    expect(files.find((file) => file.path === 'binary.pfaudit')).toMatchObject({
      linesAdded: 0,
      linesRemoved: 0,
      isText: false,
      skipReason: 'binary',
    });
  });

  it('still excludes text blobs above the size limit', () => {
    expect(files.find((file) => file.path === 'oversized.pfaudit')).toMatchObject({
      afterSizeBytes: MAX_BLOB_SIZE_BYTES + 1,
      skipReason: 'too large',
    });
  });
});
