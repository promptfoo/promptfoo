import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createToolResponse,
  truncateText,
  withTimeout,
} from '../../../../src/commands/mcp/lib/utils';

describe('MCP Utility Functions', () => {
  describe('createToolResponse', () => {
    it('should create successful tool response with data', () => {
      const response = createToolResponse('test_tool', true, { result: 'success' });

      expect(response.isError).toBe(false);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.tool).toBe('test_tool');
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toEqual({ result: 'success' });
      expect(parsedContent.timestamp).toBeDefined();
      expect(parsedContent.error).toBeUndefined();
    });

    it('should create error tool response with error message', () => {
      const response = createToolResponse('test_tool', false, undefined, 'Something went wrong');

      expect(response.isError).toBe(true);
      expect(response.content).toHaveLength(1);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.tool).toBe('test_tool');
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Something went wrong');
      expect(parsedContent.data).toBeUndefined();
    });

    it('should create response without data or error', () => {
      const response = createToolResponse('test_tool', true);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.tool).toBe('test_tool');
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toBeUndefined();
      expect(parsedContent.error).toBeUndefined();
    });

    it('should include timestamp in ISO format', () => {
      const response = createToolResponse('test_tool', true);
      const parsedContent = JSON.parse(response.content[0].text);

      expect(parsedContent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve when promise resolves before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000, 'Timed out');

      expect(result).toBe('success');
    });

    it('should reject when promise times out', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 100));
      const result = withTimeout(promise, 50, 'Operation timed out');
      const expectation = expect(result).rejects.toThrow('Operation timed out');

      await vi.runAllTimersAsync();

      await expectation;
    });

    it('should reject with original error if promise rejects', async () => {
      const promise = Promise.reject(new Error('Original error'));

      await expect(withTimeout(promise, 1000, 'Timed out')).rejects.toThrow('Original error');
    });
  });

  describe('truncateText', () => {
    it('should return original text if shorter than max length', () => {
      const text = 'Short text';
      const result = truncateText(text, 20);

      expect(result).toBe('Short text');
    });

    it('should return original text if equal to max length', () => {
      const text = 'Exact length';
      const result = truncateText(text, 12);

      expect(result).toBe('Exact length');
    });

    it('should truncate and add ellipsis if longer than max length', () => {
      const text = 'This is a very long text that should be truncated';
      const result = truncateText(text, 20);

      expect(result).toBe('This is a very lo...');
      expect(result).toHaveLength(20);
    });

    it('should truncate without ellipsis when max length is 3 or less', () => {
      expect(truncateText('Hello', 3)).toBe('Hel');
      expect(truncateText('Hello', 2)).toBe('He');
      expect(truncateText('Hello', 1)).toBe('H');
    });

    it('should use ellipsis starting at max length 4', () => {
      const result = truncateText('Hello World', 4);
      expect(result).toBe('H...');
      expect(result).toHaveLength(4);
    });

    it('should return empty string when max length is zero', () => {
      const result = truncateText('Hello', 0);

      expect(result).toBe('');
    });

    it('should return empty string when max length is negative', () => {
      const result = truncateText('Hello', -1);

      expect(result).toBe('');
    });

    it('should handle empty string', () => {
      const result = truncateText('', 10);

      expect(result).toBe('');
    });
  });
});
