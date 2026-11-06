import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countUncommittedFiles,
  getDefaultBaseBranch,
  validateOnBranch,
} from '../../../src/codeScan/git/diff';
import { GitError } from '../../../src/types/codeScan';
import { runCommand } from '../../../src/util/runCommand';

vi.mock('../../../src/util/runCommand', () => ({ runCommand: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe('Git branch selection', () => {
  it.each([
    ['master\nmain', 'main'],
    ['master\norigin/main', 'master'],
    ['origin/master', 'origin/master'],
    ['origin/main', 'origin/main'],
    ['feature', 'main'],
  ])('resolves %s to %s', async (stdout, expected) => {
    vi.mocked(runCommand).mockResolvedValue({ stdout, stderr: '' });
    await expect(getDefaultBaseBranch('/repo')).resolves.toBe(expected);
  });

  it('wraps failures outside a repository', async () => {
    vi.mocked(runCommand).mockRejectedValue(
      Object.assign(new Error('not a git repository'), { code: 128 }),
    );
    const validation = validateOnBranch('/repo');
    await expect(validation).rejects.toThrow(GitError);
    await expect(validation).rejects.toThrow('Failed to validate branch: not a git repository');
  });
});

describe('dirty file count', () => {
  it('ignores the stash header from a clean worktree with status.showStash enabled', async () => {
    vi.mocked(runCommand).mockResolvedValue({ stdout: '# stash 1\0', stderr: '' });
    await expect(countUncommittedFiles('/repo')).resolves.toBe(0);
  });

  it.each(['2 old\nname', '# original'])(
    'treats the rename source %j as a literal path',
    async (source) => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: [
          '# stash 1',
          '2 R. N... 100644 100644 100644 a b R100 # destination',
          source,
          '? # other',
          '',
        ].join('\0'),
        stderr: '',
      });
      await expect(countUncommittedFiles('/repo')).resolves.toBe(2);
    },
  );
});
