import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createToolResponse,
  truncateText,
  withTimeout,
} from '../../../../src/commands/mcp/lib/utils';

describe('MCP utility functions', () => {
  describe('createToolResponse', () => {
    it('creates a successful tool response', () => {
      const response = createToolResponse('test_tool', true, { result: 'success' });
      const content = JSON.parse(response.content[0].text);

      expect(response.isError).toBe(false);
      expect(content).toEqual({
        tool: 'test_tool',
        success: true,
        data: { result: 'success' },
        timestamp: expect.any(String),
      });
    });

    it('creates an error response', () => {
      const response = createToolResponse('test_tool', false, undefined, 'Something went wrong');
      const content = JSON.parse(response.content[0].text);

      expect(response.isError).toBe(true);
      expect(content.error).toBe('Something went wrong');
      expect(content.data).toBeUndefined();
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns a result completed before the timeout', async () => {
      await expect(withTimeout(Promise.resolve('success'), 1_000, 'Timed out')).resolves.toBe(
        'success',
      );
    });

    it('rejects when an operation exceeds the timeout', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 100));
      const result = withTimeout(promise, 50, 'Operation timed out');
      const expectation = expect(result).rejects.toThrow('Operation timed out');

      await vi.runAllTimersAsync();
      await expectation;
    });

    it('preserves the original operation error', async () => {
      await expect(
        withTimeout(Promise.reject(new Error('Original error')), 1_000, 'Timed out'),
      ).rejects.toThrow('Original error');
    });
  });

  describe('truncateText', () => {
    it('leaves text shorter than the limit unchanged', () => {
      expect(truncateText('Short text', 20)).toBe('Short text');
    });

    it('truncates long text with an ellipsis', () => {
      expect(truncateText('This is a very long text that should be truncated', 20)).toBe(
        'This is a very lo...',
      );
    });

    it('preserves small truncation limits', () => {
      expect(truncateText('Hello', 3)).toBe('Hel');
      expect(truncateText('Hello', 2)).toBe('He');
      expect(truncateText('Hello', 1)).toBe('H');
      expect(truncateText('Hello World', 4)).toBe('H...');
    });

    it('returns an empty string for non-positive limits', () => {
      expect(truncateText('Hello', 0)).toBe('');
      expect(truncateText('Hello', -1)).toBe('');
    });
  });
});
