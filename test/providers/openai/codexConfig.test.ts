import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  getOmittedCodexProcessEnvKeys,
  prepareCodexProcessEnv,
  resolveCodexWorkingDirectory,
} from '../../../src/providers/openai/codexConfig';
import { mockProcessEnv } from '../../util/utils';

describe('Codex provider configuration', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it('preserves Windows process variables without inheriting unrelated credentials', () => {
    restoreEnv = mockProcessEnv(
      {
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
});
