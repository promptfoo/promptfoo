import { resolveContext } from '../../src/assertions/contextUtils';
import * as transformUtil from '../../src/util/transform';

import type { Assertion, AtomicTestCase } from '../../src/types';

jest.mock('../../src/util/transform');

describe('resolveContext', () => {
  const mockTransform = jest.mocked(transformUtil.transform);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with context variable', () => {
    it('should return context from test.vars.context', async () => {
      const assertion: Assertion = { type: 'context-faithfulness' };
      const test: AtomicTestCase = {
        vars: { context: 'test context' },
        options: {},
      };

      const result = await resolveContext(assertion, test, 'output', 'prompt');
      expect(result).toBe('test context');
      expect(mockTransform).not.toHaveBeenCalled();
    });

    it('should use fallback context when no context variable', async () => {
      const assertion: Assertion = { type: 'context-recall' };
      const test: AtomicTestCase = { vars: {}, options: {} };

      const result = await resolveContext(assertion, test, 'output', 'prompt', 'fallback context');
      expect(result).toBe('fallback context');
      expect(mockTransform).not.toHaveBeenCalled();
    });
  });

  describe('with contextTransform', () => {
    it('should transform output to get context', async () => {
      mockTransform.mockResolvedValue('transformed context' as any);

      const assertion: Assertion = {
        type: 'context-faithfulness',
        contextTransform: 'output.context',
      };
      const test: AtomicTestCase = { vars: {}, options: {} };

      const result = await resolveContext(assertion, test, { context: 'data' }, 'prompt');

      expect(result).toBe('transformed context');
      expect(mockTransform).toHaveBeenCalledWith(
        'output.context',
        { context: 'data' },
        {
          vars: {},
          prompt: { label: 'prompt' },
        },
      );
    });

    it('should prioritize contextTransform over context variable', async () => {
      mockTransform.mockResolvedValue('transformed context' as any);

      const assertion: Assertion = {
        type: 'context-faithfulness',
        contextTransform: 'output.context',
      };
      const test: AtomicTestCase = {
        vars: { context: 'original context' },
        options: {},
      };

      const result = await resolveContext(assertion, test, { context: 'data' }, 'prompt');

      expect(result).toBe('transformed context');
      expect(mockTransform).toHaveBeenCalledWith(
        'output.context',
        { context: 'data' },
        {
          vars: { context: 'original context' },
          prompt: { label: 'prompt' },
        },
      );
    });

    it('should throw error if transform returns non-string', async () => {
      mockTransform.mockResolvedValue(123 as any);

      const assertion: Assertion = {
        type: 'context-faithfulness',
        contextTransform: 'output.invalid',
      };
      const test: AtomicTestCase = { vars: {}, options: {} };

      await expect(resolveContext(assertion, test, 'output', 'prompt')).rejects.toThrow(
        'contextTransform must return a string value. Got number. Check your transform expression: output.invalid',
      );
    });

    it('should throw error if transform fails', async () => {
      mockTransform.mockRejectedValue(new Error('Transform failed'));

      const assertion: Assertion = {
        type: 'context-faithfulness',
        contextTransform: 'output.invalid',
      };
      const test: AtomicTestCase = { vars: {}, options: {} };

      await expect(resolveContext(assertion, test, 'output', 'prompt')).rejects.toThrow(
        "Failed to transform context using expression 'output.invalid': Transform failed",
      );
    });
  });

  describe('error cases', () => {
    it('should throw error when no context is available', async () => {
      const assertion: Assertion = { type: 'context-faithfulness' };
      const test: AtomicTestCase = { vars: {}, options: {} };

      await expect(resolveContext(assertion, test, 'output', 'prompt')).rejects.toThrow(
        'Context is required for context-based assertions. Provide either a "context" variable in your test case or use "contextTransform" to extract context from the provider response.',
      );
    });

    it('should throw error when context is empty string', async () => {
      const assertion: Assertion = { type: 'context-faithfulness' };
      const test: AtomicTestCase = {
        vars: { context: '' },
        options: {},
      };

      await expect(resolveContext(assertion, test, 'output', 'prompt')).rejects.toThrow(
        'Context is required for context-based assertions. Provide either a "context" variable in your test case or use "contextTransform" to extract context from the provider response.',
      );
    });

    it('should throw error when contextTransform returns empty string', async () => {
      mockTransform.mockResolvedValue('' as any);

      const assertion: Assertion = {
        type: 'context-faithfulness',
        contextTransform: 'output.empty',
      };
      const test: AtomicTestCase = { vars: {}, options: {} };

      await expect(resolveContext(assertion, test, 'output', 'prompt')).rejects.toThrow(
        'Context is required for context-based assertions. Provide either a "context" variable in your test case or use "contextTransform" to extract context from the provider response.',
      );
    });
  });
});
