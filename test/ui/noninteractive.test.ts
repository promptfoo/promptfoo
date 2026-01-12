import { Writable } from 'stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NonInteractiveProgress,
  NonInteractiveSpinner,
  TextOutput,
} from '../../src/ui/noninteractive';

class MockWriteStream extends Writable {
  public chunks: string[] = [];
  public isTTY = false;
  public columns = 80;

  _write(chunk: Buffer | string, _encoding: string, callback: () => void) {
    this.chunks.push(chunk.toString());
    callback();
  }

  getOutput(): string {
    return this.chunks.join('');
  }

  clear() {
    this.chunks = [];
  }
}

describe('TextOutput', () => {
  let stream: MockWriteStream;
  let output: TextOutput;

  beforeEach(() => {
    stream = new MockWriteStream();
    output = new TextOutput(stream as unknown as NodeJS.WriteStream, false);
  });

  it('should write a line', () => {
    output.writeLine('Hello, world!');
    expect(stream.getOutput()).toBe('Hello, world!\n');
  });

  it('should write without newline', () => {
    output.write('Hello');
    output.write(' World');
    expect(stream.getOutput()).toBe('Hello World');
  });

  it('should write info messages', () => {
    output.info('Test message');
    expect(stream.getOutput()).toContain('info');
    expect(stream.getOutput()).toContain('Test message');
  });

  it('should write success messages', () => {
    output.success('Operation completed');
    expect(stream.getOutput()).toContain('success');
    expect(stream.getOutput()).toContain('Operation completed');
  });

  it('should write warning messages', () => {
    output.warn('Be careful');
    expect(stream.getOutput()).toContain('warning');
    expect(stream.getOutput()).toContain('Be careful');
  });

  it('should write error messages', () => {
    output.error('Something went wrong');
    expect(stream.getOutput()).toContain('error');
    expect(stream.getOutput()).toContain('Something went wrong');
  });

  it('should write headers', () => {
    output.header('My Header');
    const result = stream.getOutput();
    expect(result).toContain('My Header');
    expect(result).toContain('=========');
  });

  it('should write key-value pairs', () => {
    output.keyValue('Name', 'John');
    expect(stream.getOutput()).toContain('Name');
    expect(stream.getOutput()).toContain('John');
  });
});

describe('NonInteractiveProgress', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The progress writes to stdout through TextOutput
    consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should start progress tracking', () => {
    const progress = new NonInteractiveProgress('Evaluating');
    progress.start(100);

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('Evaluating');
    expect(output).toContain('0/100');
  });

  it('should update progress at threshold intervals', () => {
    const progress = new NonInteractiveProgress('Test', 10);
    progress.start(100);

    consoleSpy.mockClear();

    // Update below threshold - should not log
    progress.update({ completed: 5, total: 100 });
    // Update at threshold - should log
    progress.update({ completed: 10, total: 100 });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('10/100');
    expect(output).toContain('10%');
  });

  it('should report completion', () => {
    const progress = new NonInteractiveProgress('Test');
    progress.start(100);

    consoleSpy.mockClear();

    progress.complete({ passed: 90, failed: 10, errors: 0 });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('complete');
    expect(output).toContain('90 passed');
    expect(output).toContain('10 failed');
  });
});

describe('NonInteractiveSpinner', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log start message', () => {
    const spinner = new NonInteractiveSpinner();
    spinner.start('Loading...');

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('Loading...');
  });

  it('should log success message', () => {
    const spinner = new NonInteractiveSpinner();
    spinner.start('Loading...');

    consoleSpy.mockClear();

    spinner.succeed('Done!');

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('Done!');
  });

  it('should log failure message', () => {
    const spinner = new NonInteractiveSpinner();
    spinner.start('Loading...');

    consoleSpy.mockClear();

    spinner.fail('Failed!');

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('Failed!');
  });
});
