import { describe, expect, it } from 'vitest';
import { onlineCaptureArgs } from '../../../src/commands/online/captureArgs';

describe('lightweight hook dispatch', () => {
  it.each([
    ['online', 'capture'],
    ['-v', 'online', 'capture'],
    ['--verbose', 'online', 'capture'],
    ['--env-file', 'online', 'online', 'capture'],
    ['--env-path', 'capture', 'online', 'capture'],
    ['--env-file=ignored.env', 'online', 'capture'],
    ['online', '--env-path=ignored.env', '--verbose', 'capture'],
  ])('detects capture with common options: %j', (...prefix) => {
    expect(onlineCaptureArgs([...prefix, '--agent', 'generic'])).toEqual(['--agent', 'generic']);
  });
  it.each([
    [],
    ['online'],
    ['--env-file'],
    ['online', 'watch'],
    ['eval', 'online', 'capture'],
    ['--env-file', 'online', 'capture'],
    ['--', 'online', 'capture'],
    ['--help', 'online', 'capture'],
  ])('does not mistake a value or another command for capture: %j', (...argv) => {
    expect(onlineCaptureArgs(argv)).toBeUndefined();
  });
});
