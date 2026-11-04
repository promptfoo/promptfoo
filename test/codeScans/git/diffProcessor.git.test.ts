import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_BLOB_SIZE_BYTES } from '../../../src/codeScan/constants/filtering';
import { processDiff } from '../../../src/codeScan/git/diffProcessor';

describe('processDiff with real git blobs', () => {
  let repoPath: string;
  let files: Awaited<ReturnType<typeof processDiff>>;
  const text = 'const message = "scan this text";\n'.repeat(200);

  beforeAll(async () => {
    repoPath = await mkdtemp(path.join(tmpdir(), 'promptfoo-diff-text-'));
    const git = async (args: string[], input?: string | Buffer): Promise<string> => {
      const result = await execa('git', args, {
        cwd: repoPath,
        input,
        env: {
          GIT_AUTHOR_NAME: 'Diff test',
          GIT_AUTHOR_EMAIL: 'diff-test@example.com',
          GIT_COMMITTER_NAME: 'Diff test',
          GIT_COMMITTER_EMAIL: 'diff-test@example.com',
        },
      });
      return result.stdout;
    };

    await git(['init', '--bare', '--template=']);
    const emptyTree = await git(['mktree'], '');
    const base = await git(['commit-tree', emptyTree, '-m', 'base']);
    const fixtures = [
      ['known.ts', text],
      ['unknown.pfaudit', text],
      ['extensionless', text],
      ['binary.pfaudit', Buffer.alloc(8192)],
      ['oversized.pfaudit', Buffer.alloc(MAX_BLOB_SIZE_BYTES + 1, 'a')],
    ] as const;
    const entries = await Promise.all(
      fixtures.map(async ([filename, data]) => {
        const hash = await git(['hash-object', '-w', '--stdin'], data);
        return `100644 blob ${hash}\t${filename}\n`;
      }),
    );
    const tree = await git(['mktree'], entries.join(''));
    const head = await git(['commit-tree', tree, '-p', base, '-m', 'add fixtures']);

    files = await processDiff(repoPath, base, head);
  });

  afterAll(async () => {
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true });
    }
  });

  it.each(['known.ts', 'unknown.pfaudit', 'extensionless'])(
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

  it('still excludes binary content with an unknown extension', () => {
    expect(files.find((file) => file.path === 'binary.pfaudit')).toMatchObject({
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
