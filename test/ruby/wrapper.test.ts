import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runRuby } from '../../src/ruby/rubyUtils';
import { runRubyCode } from '../../src/ruby/wrapper';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../../src/util/secureTempFiles';

vi.mock('../../src/ruby/rubyUtils', () => ({
  runRuby: vi.fn(),
}));

vi.mock('../../src/util/secureTempFiles', () => ({
  createSecureTempDirectory: vi.fn().mockResolvedValue('/tmp/promptfoo-ruby-code-test'),
  removeSecureTempDirectory: vi.fn().mockResolvedValue(undefined),
  writeSecureTempFile: vi.fn(
    async (directory: string, filename: string) => `${directory}/${filename}`,
  ),
}));

describe('Ruby wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes generated Ruby code from a secure temporary file and removes its directory', async () => {
    vi.mocked(runRuby).mockResolvedValue('execution result');

    const result = await runRubyCode('puts "hello"', 'main', []);

    expect(result).toBe('execution result');
    expect(createSecureTempDirectory).toHaveBeenCalledWith('promptfoo-ruby-code-');
    expect(writeSecureTempFile).toHaveBeenCalledWith(
      '/tmp/promptfoo-ruby-code-test',
      'script.rb',
      'puts "hello"',
    );
    expect(runRuby).toHaveBeenCalledWith('/tmp/promptfoo-ruby-code-test/script.rb', 'main', []);
    expect(removeSecureTempDirectory).toHaveBeenCalledWith('/tmp/promptfoo-ruby-code-test');
  });
});
