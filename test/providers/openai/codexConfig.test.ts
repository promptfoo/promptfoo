import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findCodexGitRepositoryRoot,
  getOmittedCodexProcessEnvKeys,
  prepareCodexProcessEnv,
  resolveCodexWorkingDirectory,
  validateCodexWorkingDirectory,
} from '../../../src/providers/openai/codexConfig';
import { mockProcessEnv } from '../../util/utils';

describe('Codex provider configuration', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.restoreAllMocks();
  });

  it('preserves Windows process variables without inheriting unrelated credentials', () => {
    restoreEnv = mockProcessEnv(
      {
        PATH: 'C:\\Windows\\System32',
        Path: 'C:\\Windows\\System32',
        SystemRoot: 'C:\\Windows',
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
        PATHEXT: '.COM;.EXE',
        USERPROFILE: 'C:\\Users\\promptfoo',
        UNRELATED_API_KEY: 'secret',
      },
      { clear: true },
    );

    expect(prepareCodexProcessEnv({ cli_env: { CUSTOM_FLAG: 42 } })).toEqual({
      COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
      CUSTOM_FLAG: '42',
      PATH: 'C:\\Windows\\System32',
      PATHEXT: '.COM;.EXE',
      Path: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\promptfoo',
    });
  });

  it('removes inherited OpenAI credentials for a custom model provider', () => {
    restoreEnv = mockProcessEnv({
      CODEX_API_KEY: 'ambient-codex-key',
      OPENAI_API_KEY: 'ambient-openai-key',
    });

    const env = prepareCodexProcessEnv(
      { inherit_process_env: true, model_provider: 'amazon-bedrock' },
      'ambient-openai-key',
    );

    expect(env.CODEX_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('canonicalizes environment keys after injecting API credentials', () => {
    restoreEnv = mockProcessEnv({ PATH: '/usr/bin' }, { clear: true });

    const injected = prepareCodexProcessEnv(
      { cli_env: { Z_FLAG: 'last', A_FLAG: 'first' } },
      'test-key',
    );
    const explicit = prepareCodexProcessEnv(
      {
        cli_env: {
          Z_FLAG: 'last',
          OPENAI_API_KEY: 'test-key',
          CODEX_API_KEY: 'test-key',
          A_FLAG: 'first',
        },
      },
      'test-key',
    );

    expect(JSON.stringify(injected)).toBe(JSON.stringify(explicit));
    expect(Object.keys(injected)).toEqual([...Object.keys(injected)].sort());
  });

  it('only reports omitted SSH credentials when networking is enabled', () => {
    restoreEnv = mockProcessEnv({ HTTP_PROXY: 'http://proxy', SSH_AUTH_SOCK: '/tmp/ssh.sock' });

    expect(getOmittedCodexProcessEnvKeys({})).toContain('HTTP_PROXY');
    expect(getOmittedCodexProcessEnvKeys({})).not.toContain('SSH_AUTH_SOCK');
    expect(getOmittedCodexProcessEnvKeys({}, true)).toContain('SSH_AUTH_SOCK');
  });

  it('resolves working directories relative to the configuration directory', () => {
    expect(resolveCodexWorkingDirectory('../workspace', '/config/project')).toBe(
      path.resolve('/config/project', '../workspace'),
    );
  });

  it('rejects missing working directories', () => {
    vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => validateCodexWorkingDirectory('/missing')).toThrow(
      "Working directory /missing does not exist or isn't accessible: ENOENT",
    );
  });

  it('rejects paths that are not directories', () => {
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);

    expect(() => validateCodexWorkingDirectory('/file')).toThrow(
      'Working directory /file is not a directory',
    );
  });

  it('rejects working directories outside a Git repository', () => {
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => validateCodexWorkingDirectory('/workspace', false, 'Codex app-server')).toThrow(
      'Codex app-server requires a Git repository by default',
    );
  });

  it('accepts repository subdirectories and Git worktrees', () => {
    const repositoryRoot = path.resolve('repository');
    const workingDirectory = path.join(repositoryRoot, 'nested', 'workspace');
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.spyOn(fs, 'existsSync').mockImplementation(
      (candidate) => candidate === path.join(repositoryRoot, '.git'),
    );

    expect(findCodexGitRepositoryRoot(workingDirectory)).toBe(repositoryRoot);
    expect(() => validateCodexWorkingDirectory(workingDirectory)).not.toThrow();
  });

  it('honors skip_git_repo_check without searching for a repository', () => {
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => validateCodexWorkingDirectory('/workspace', true)).not.toThrow();
    expect(exists).not.toHaveBeenCalled();
  });
});
