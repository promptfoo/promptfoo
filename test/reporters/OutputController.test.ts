import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputController } from '../../src/reporters/OutputController';

describe('OutputController', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('captures output, flushes it, and restores the streams', async () => {
    const controller = new OutputController();
    const clearStatus = vi.fn();
    const reprintStatus = vi.fn();

    controller.setStatusCallbacks(clearStatus, reprintStatus);
    controller.startCapture();
    controller.startCapture();

    process.stdout.write('stdout line');
    process.stderr.write('stderr line');

    expect(controller.isActive()).toBe(true);
    expect(controller.hasBufferedOutput()).toBe(true);
    expect(stderrWrite).toHaveBeenCalledWith('stderr line');
    expect(clearStatus).toHaveBeenCalledTimes(1);
    expect(reprintStatus).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();

    expect(stdoutWrite).toHaveBeenCalledWith('stdout line');
    expect(clearStatus).toHaveBeenCalledTimes(2);
    expect(reprintStatus).toHaveBeenCalledTimes(2);
    expect(controller.hasBufferedOutput()).toBe(false);

    controller.stopCapture();

    expect(controller.isActive()).toBe(false);
    process.stdout.write('restored stdout');
    process.stderr.write('restored stderr');
    expect(stdoutWrite).toHaveBeenCalledWith('restored stdout');
    expect(stderrWrite).toHaveBeenCalledWith('restored stderr');
  });

  it('supports manual buffering and direct writes while capture is active', () => {
    const controller = new OutputController();
    const stdoutCallback = vi.fn();
    const stderrCallback = vi.fn();

    controller.setSuppressAutoFlush(true);
    controller.startCapture();

    process.stdout.write(Buffer.from('stdout'), stdoutCallback);
    process.stderr.write(Buffer.from('stderr'), stderrCallback);

    expect(stdoutCallback).toHaveBeenCalled();
    expect(stderrCallback).toHaveBeenCalled();
    expect(controller.hasBufferedOutput()).toBe(true);
    expect(controller.getBufferedOutput()).toBe('stderrstdout');
    expect(controller.hasBufferedOutput()).toBe(false);

    controller.writeToStdout('direct stdout');
    controller.writeToStderr('direct stderr');

    expect(stdoutWrite).toHaveBeenCalledWith('direct stdout');
    expect(stderrWrite).toHaveBeenCalledWith('direct stderr');

    controller.forceFlush();
    controller.stopCapture();
  });

  it('flushes scheduled output on demand and is harmless when inactive', () => {
    const controller = new OutputController();

    controller.stopCapture();
    controller.writeToStdout('plain stdout');
    controller.writeToStderr('plain stderr');

    expect(stdoutWrite).toHaveBeenCalledWith('plain stdout');
    expect(stderrWrite).toHaveBeenCalledWith('plain stderr');
    expect(controller.isActive()).toBe(false);
    expect(controller.hasBufferedOutput()).toBe(false);

    controller.startCapture();
    process.stdout.write('scheduled stdout');

    controller.forceFlush();

    expect(stdoutWrite).toHaveBeenCalledWith('scheduled stdout');
    controller.stopCapture();
  });
});
