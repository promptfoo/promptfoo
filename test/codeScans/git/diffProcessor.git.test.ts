import { execFile, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_BLOB_SIZE_BYTES } from '../../../src/codeScan/constants/filtering';
import { processDiff } from '../../../src/codeScan/git/diffProcessor';
import { mockProcessEnv } from '../../util/utils';

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

describe('full-scan diff data sharing', () => {
  const git = (repo: string, args: string[], input?: string) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Diff test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgSign=false',
        ...args,
      ],
      { cwd: repo, input, encoding: 'utf8' },
    ).trim();

  it('returns only literal, in-scope regular files whose complete blobs pass the sharing policy', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'promptfoo-full-diff-'));
    const write = async (name: string, body: string) => {
      const file = path.join(repo, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    };
    try {
      git(repo, ['init', '--quiet', '--template=']);
      git(repo, ['config', 'diff.srcPrefix', 'private-prefix/']);
      git(repo, ['config', 'diff.dstPrefix', 'private-prefix/']);
      const privateMarker = '-----BEGIN PRIVATE KEY-----';
      const secretBlob = privateMarker + '\n' + 'ordinary context\n'.repeat(25);
      for (const name of ['remove.ts', 'modified.ts', 'cleaned.ts']) {
        await write('app/' + name, secretBlob);
      }
      await write('app/from.ts', 'renamed fixture');
      await write('app/switch', 'old standalone file');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-qm', 'base']);
      const base = git(repo, ['rev-parse', 'HEAD']);

      await rm(path.join(repo, 'app/remove.ts'));
      await write('app/modified.ts', secretBlob + 'unrelated change');
      await write('app/cleaned.ts', 'removed a private fixture');
      await write('app/added.ts', privateMarker);
      await write('app/visible.ts', 'visible content');
      await write('app/settings/secrets.json', 'sensitive filename fixture');
      await write('app/[ab].ts', 'literal brackets');
      await write('app/a.ts', privateMarker);
      await rm(path.join(repo, 'app/switch'));
      await write('app/switch/credentials.json', 'sensitive descendant');
      await write('outside.ts', 'sibling fixture');
      git(repo, ['mv', 'app/from.ts', 'app/to.ts']);
      git(repo, ['add', '.']);
      const link = git(repo, ['hash-object', '-w', '--stdin'], 'untracked-target.ts');
      git(repo, ['update-index', '--add', '--cacheinfo', `120000,${link},app/link.ts`]);
      git(repo, ['update-index', '--add', '--cacheinfo', `160000,${base},app/nested-repo`]);
      git(repo, ['commit', '-qm', 'changes']);

      const files = await processDiff(path.join(repo, 'app'), base, 'HEAD', true);
      expect(files.map((file) => file.path).sort()).toEqual([
        'app/[ab].ts',
        'app/from.ts',
        'app/switch',
        'app/to.ts',
        'app/visible.ts',
      ]);
      expect(files.find((file) => file.path === 'app/[ab].ts')?.patch).toContain(
        'literal brackets',
      );
      expect(files.find((file) => file.path === 'app/from.ts')?.status).toBe('D');
      expect(files.find((file) => file.path === 'app/to.ts')?.status).toBe('A');
      expect(files.find((file) => file.path === 'app/switch')).toMatchObject({
        status: 'D',
        patch: expect.stringContaining('old standalone file'),
      });
      const serialized = JSON.stringify(files);
      expect(serialized).not.toContain(privateMarker);
      expect(serialized).not.toContain('private-prefix');
      expect(serialized).not.toContain('credentials.json');
      expect(serialized).not.toContain('sibling fixture');
      await expect(processDiff(repo, base, 'missing-private-ref', true)).rejects.toThrow(
        /^Failed to process the full-scan diff$/,
      );
    } finally {
      await rm(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('suppresses a patch if a case-insensitive pathspec also matches an excluded blob', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'promptfoo-diff-case-'));
    try {
      git(repo, ['init', '--bare', '--quiet', '--template=']);
      const emptyTree = git(repo, ['mktree'], '');
      const base = git(repo, ['commit-tree', emptyTree, '-m', 'base']);
      const safe = git(repo, ['hash-object', '-w', '--stdin'], 'ordinary fixture');
      const restricted = git(repo, ['hash-object', '-w', '--stdin'], '-----BEGIN PRIVATE KEY-----');
      // Build the tree directly so both case variants exist on case-insensitive filesystems too.
      const tree = git(
        repo,
        ['mktree', '-z'],
        `100644 blob ${safe}\tTest.ts\0` +
          `100644 blob ${restricted}\ttest.ts\0` +
          `100644 blob ${safe}\tother.ts\0`,
      );
      const head = git(repo, ['commit-tree', tree, '-p', base, '-m', 'fixture']);
      const restore = mockProcessEnv({ GIT_ICASE_PATHSPECS: '1' });
      try {
        const files = await processDiff(repo, base, head, true);
        expect(files.map((file) => file.path)).toEqual(['other.ts']);
        expect(files[0].patch).toContain('ordinary fixture');
        expect(files[0].patch).not.toContain('PRIVATE KEY');
      } finally {
        restore();
      }
    } finally {
      await rm(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('inspects and emits the original blobs when local Git replacements reinterpret a commit', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'promptfoo-diff-objects-'));
    try {
      git(repo, ['init', '--quiet', '--template=']);
      git(repo, ['commit', '--allow-empty', '-qm', 'base']);
      const base = git(repo, ['rev-parse', 'HEAD']);
      const eligible = 'intended committed content';
      await writeFile(path.join(repo, 'visible.custom'), eligible);
      await writeFile(path.join(repo, 'omit.ts'), '-----BEGIN PRIVATE KEY-----');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-qm', 'physical comparison']);
      const compare = git(repo, ['rev-parse', 'HEAD']);

      for (const pathName of ['visible.custom', 'omit.ts']) {
        const original = git(repo, ['rev-parse', `${compare}:${pathName}`]);
        const substitute = git(repo, ['hash-object', '-w', '--stdin'], 'local replacement bytes');
        git(repo, ['replace', original, substitute]);
      }
      await writeFile(path.join(repo, 'replacement.ts'), 'replacement commit inventory');
      git(repo, ['add', 'replacement.ts']);
      git(repo, ['commit', '-qm', 'replacement comparison']);
      git(repo, ['replace', compare, git(repo, ['rev-parse', 'HEAD'])]);

      const files = await processDiff(repo, base, compare, true);
      expect(files.map((file) => file.path)).toEqual(['visible.custom']);
      expect(files[0]).toMatchObject({
        afterSizeBytes: Buffer.byteLength(eligible),
        patch: expect.stringContaining(eligible),
      });
      expect(files[0].patch).not.toContain('replacement');
    } finally {
      await rm(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
