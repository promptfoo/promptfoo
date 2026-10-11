import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { type Dispatcher, interceptors } from 'undici';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { createDecompressionInterceptor } from '../../../src/util/fetch/decompress';

vi.mock('undici', () => ({ interceptors: { decompress: vi.fn() } }));

const notice = 'DecompressInterceptor is experimental and subject to change';
const interceptor: Dispatcher.DispatchInterceptor = (dispatch) => dispatch;

describe('createDecompressionInterceptor', () => {
  let emitWarning: MockInstance<typeof process.emitWarning>;

  beforeEach(() => {
    emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    vi.mocked(interceptors.decompress).mockReset();
    vi.mocked(interceptors.decompress).mockReturnValue(interceptor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(interceptors.decompress).mockReset();
  });

  it('keeps response decompression while silencing the synchronous undici notice', () => {
    vi.mocked(interceptors.decompress).mockImplementation(() => {
      process.emitWarning(notice, 'ExperimentalWarning');
      return interceptor;
    });

    expect(createDecompressionInterceptor()).toBe(interceptor);
    expect(interceptors.decompress).toHaveBeenCalledWith({ skipErrorResponses: false });
    expect(emitWarning).not.toHaveBeenCalled();
    expect(process.emitWarning).toBe(emitWarning);
  });

  it.each([
    ['a different experimental feature', 'ExperimentalWarning'],
    [notice, 'DeprecationWarning'],
    [notice, undefined],
  ] as const)('preserves a different warning message or type: %s (%s)', (message, type) => {
    vi.mocked(interceptors.decompress).mockImplementation(() => {
      process.emitWarning(message, type);
      return interceptor;
    });

    createDecompressionInterceptor();

    expect(emitWarning).toHaveBeenCalledExactlyOnceWith(message, type);
    expect(emitWarning.mock.contexts[0]).toBe(process);
  });

  it('preserves warning Error objects and the options overload', () => {
    const error = Object.assign(new Error(notice), { name: 'ExperimentalWarning' });
    const options = { type: 'ExperimentalWarning', code: 'ANOTHER_NOTICE', detail: 'details' };
    vi.mocked(interceptors.decompress).mockImplementation(() => {
      process.emitWarning(error);
      process.emitWarning(notice, options);
      return interceptor;
    });

    createDecompressionInterceptor();

    expect(emitWarning).toHaveBeenNthCalledWith(1, error);
    expect(emitWarning).toHaveBeenNthCalledWith(2, notice, options);
  });

  it('preserves all positional warning arguments', () => {
    function warningOrigin() {}
    vi.mocked(interceptors.decompress).mockImplementation(() => {
      process.emitWarning('another notice', 'ExperimentalWarning', 'ANOTHER_NOTICE', warningOrigin);
      return interceptor;
    });

    createDecompressionInterceptor();

    expect(emitWarning).toHaveBeenCalledExactlyOnceWith(
      'another notice',
      'ExperimentalWarning',
      'ANOTHER_NOTICE',
      warningOrigin,
    );
  });

  it('restores warning delivery after the factory returns', () => {
    createDecompressionInterceptor();
    process.emitWarning(notice, 'ExperimentalWarning');

    expect(emitWarning).toHaveBeenCalledExactlyOnceWith(notice, 'ExperimentalWarning');
    expect(process.emitWarning).toBe(emitWarning);
  });

  it('restores warning delivery and propagates a factory failure', () => {
    const error = new Error('Unable to create decompressor');
    vi.mocked(interceptors.decompress).mockImplementation(() => {
      throw error;
    });

    expect(createDecompressionInterceptor).toThrow(error);
    expect(process.emitWarning).toBe(emitWarning);

    process.emitWarning('warning after failure');
    expect(emitWarning).toHaveBeenCalledExactlyOnceWith('warning after failure');
  });

  it('preserves a newer warning handler installed during initialization', () => {
    const replacementEmitWarning = vi.fn() as typeof process.emitWarning;
    emitWarning.mockImplementation(() => {
      process.emitWarning = replacementEmitWarning;
    });
    vi.mocked(interceptors.decompress).mockImplementation(() => {
      process.emitWarning('another notice');
      return interceptor;
    });

    createDecompressionInterceptor();
    process.emitWarning('warning after initialization');

    expect(emitWarning).toHaveBeenCalledExactlyOnceWith('another notice');
    expect(process.emitWarning).toBe(replacementEmitWarning);
    expect(replacementEmitWarning).toHaveBeenCalledExactlyOnceWith('warning after initialization');
  });

  it('suppresses the real dependency notice without disabling other Node warnings', () => {
    // A fresh process ensures undici has not already emitted its once-per-process notice.
    const helperUrl = new URL('../../../src/util/fetch/decompress.ts', import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        `import { createDecompressionInterceptor } from ${JSON.stringify(helperUrl)};
         createDecompressionInterceptor();
         process.emitWarning('Unrelated runtime notice', 'ExperimentalWarning');`,
      ],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '', NODE_NO_WARNINGS: '' },
        timeout: 10000,
      },
    );

    expect(result.status, result.error?.message ?? result.stderr).toBe(0);
    expect(result.stderr).not.toContain(notice);
    expect(result.stderr).toContain('ExperimentalWarning: Unrelated runtime notice');
  });
});
