import fs from 'fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString } from '../../src/envars';
import logger from '../../src/logger';
import * as rubyUtils from '../../src/ruby/rubyUtils';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../../src/util/secureTempFiles';

const { mockExecFileAsync, mockExecFile } = vi.hoisted(() => {
  const mockExecFileAsync = vi.fn();
  const mockExecFile = Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mockExecFileAsync,
  });
  return { mockExecFileAsync, mockExecFile };
});

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('../../src/envars', () => ({
  getEnvString: vi.fn(),
}));

vi.mock('../../src/esm', () => ({
  getWrapperDir: vi.fn(() => '/wrappers'),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/util/secureTempFiles', () => ({
  createSecureTempDirectory: vi.fn(),
  removeSecureTempDirectory: vi.fn(),
  writeSecureTempFile: vi.fn(),
}));

describe('Ruby utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileAsync.mockReset();
    rubyUtils.state.cachedRubyPath = null;
    rubyUtils.state.validationPromise = null;
    rubyUtils.state.validatingPath = null;
    vi.mocked(getEnvString).mockReturnValue('');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ type: 'final_result', data: 'secret-result' }),
    );
    vi.mocked(createSecureTempDirectory).mockResolvedValue('/tmp/promptfoo-ruby-test');
    vi.mocked(removeSecureTempDirectory).mockResolvedValue(undefined);
    vi.mocked(writeSecureTempFile).mockImplementation(
      async (directory: string, filename: string) => `${directory}/${filename}`,
    );
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: 'ruby 3.3.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' });
  });

  it('uses secure temporary files without logging arguments or results', async () => {
    const result = await rubyUtils.runRuby('/path/to/script.rb', 'call_api', ['secret-input']);

    expect(result).toBe('secret-result');
    expect(createSecureTempDirectory).toHaveBeenCalledWith('promptfoo-ruby-');
    expect(writeSecureTempFile).toHaveBeenNthCalledWith(
      1,
      '/tmp/promptfoo-ruby-test',
      'input.json',
      '["secret-input"]',
    );
    expect(writeSecureTempFile).toHaveBeenNthCalledWith(
      2,
      '/tmp/promptfoo-ruby-test',
      'output.json',
      '',
    );
    expect(removeSecureTempDirectory).toHaveBeenCalledWith('/tmp/promptfoo-ruby-test');

    const debugMessages = vi.mocked(logger.debug).mock.calls.flat().map(String).join('\n');
    expect(debugMessages).not.toContain('secret-input');
    expect(debugMessages).not.toContain('secret-result');
  });

  it('classifies routine stderr without reporting it as an error', async () => {
    mockExecFileAsync
      .mockReset()
      .mockResolvedValueOnce({ stdout: 'ruby 3.3.0\n', stderr: '' })
      .mockResolvedValueOnce({
        stdout: '',
        stderr:
          "INFO: loaded\nplain progress\nRuntimeError: boom\n\tfrom /path/script.rb:12:in `call_api'\n",
      });

    await rubyUtils.runRuby('/path/to/script.rb', 'call_api', []);

    expect(logger.info).toHaveBeenCalledWith('INFO: loaded');
    expect(logger.warn).toHaveBeenCalledWith('plain progress');
    expect(logger.error).toHaveBeenCalledWith('RuntimeError: boom');
    expect(logger.error).toHaveBeenCalledWith("\tfrom /path/script.rb:12:in `call_api'");
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('plain progress'));
  });
});
