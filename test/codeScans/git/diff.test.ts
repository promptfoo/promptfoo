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
    vi.mocked(runCommand).mockRejectedValue(new Error('not a git repository'));
    await expect(validateOnBranch('/repo')).rejects.toThrow(GitError);
  });
});

describe('dirty file count', () => {
  it('counts a renamed file once and treats the original name as a literal path', async () => {
    vi.mocked(runCommand).mockResolvedValue({
      stdout: [
        '2 R. N... 100644 100644 100644 a b R100 new name',
        '2 old\nname',
        '? other',
        '',
      ].join('\0'),
      stderr: '',
    });
    await expect(countUncommittedFiles('/repo')).resolves.toBe(2);
  });
});
