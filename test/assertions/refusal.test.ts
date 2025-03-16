import { handleIsRefusal } from '../../src/assertions/refusal';
import type {
  Assertion,
  GradingResult,
  AssertionValueFunctionContext,
  AtomicTestCase,
} from '../../src/types';

const assertion: Assertion = {
  type: 'is-refusal',
};

const defaultContext: AssertionValueFunctionContext = {
  prompt: undefined,
  vars: {},
  test: {} as AtomicTestCase,
  logProbs: undefined,
  config: {},
  provider: undefined,
  providerResponse: undefined,
};

describe('is-refusal assertion', () => {
  // -------------------------------------------------- Basic Tests ------------------------------------------------------ //
  describe('Basic tests', () => {
    it('should pass when the output is a refusal message', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'I apologize, but I cannot assist with that request.',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'I apologize, but I cannot assist with that request.',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the output is not a refusal message', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: "Here's how to accomplish that task...",
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: "Here's how to accomplish that task...",
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: false,
        score: 0,
        reason: 'Expected output to be a refusal',
      });
    });

    it('should pass when inverse=true and output is not a refusal', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: "Here's how to accomplish that task...",
        inverse: true,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: "Here's how to accomplish that task...",
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it('should fail when inverse=true and output is a refusal', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'I apologize, but I cannot assist with that request.',
        inverse: true,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'I apologize, but I cannot assist with that request.',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: false,
        score: 0,
        reason: 'Expected output to not be a refusal',
      });
    });
  });

  // ------------------------------------------ Edge Cases and Special Values ------------------------------------------- //
  describe('Edge cases and special values', () => {
    it('should handle undefined output', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: undefined as any,
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: '',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 0,
        reason: 'No value provided, assumed to be a refusal',
      });
    });

    it('should handle null output', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: null as any,
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: '',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 0,
        reason: 'No value provided, assumed to be a refusal',
      });
    });

    it('should handle empty string output', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: '',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: '',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 0,
        reason: 'Empty response treated as refusal',
      });
    });

    it('should handle whitespace-only output', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: '   \n\t  ',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: '   \n\t  ',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 0,
        reason: 'Empty response treated as refusal',
      });
    });

    it('should handle empty string with inverse=true', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: '',
        inverse: true,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: '',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: false,
        score: 0,
        reason: 'Expected output to not be a refusal',
      });
    });
  });

  // ------------------------------------------ Refusal Pattern Tests ------------------------------------------- //
  describe('Refusal pattern tests', () => {
    it('should detect refusal with "I am not able to" prefix', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'I am not able to help with that request',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'I am not able to help with that request',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it('should detect refusal with "As an AI" pattern', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'As an AI, I cannot assist with that request',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'As an AI, I cannot assist with that request',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it('should detect refusal with ethics/legality mentions', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'That request is not ethical and I cannot assist',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'That request is not ethical and I cannot assist',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it('should detect refusal with content filter message', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'The generated text has been blocked by our content filters',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'The generated text has been blocked by our content filters',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });
  });

  // ------------------------------------------ Case Sensitivity Tests ------------------------------------------- //
  describe('Case sensitivity tests', () => {
    it('should detect refusal with mixed case', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'i Am NoT able TO help with that Request',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'i Am NoT able TO help with that Request',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it('should detect refusal with all uppercase', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'I CANNOT ASSIST WITH THAT REQUEST',
        inverse: false,
        baseType: 'is-refusal',
        context: defaultContext,
        outputString: 'I CANNOT ASSIST WITH THAT REQUEST',
        providerResponse: {},
        test: {} as AtomicTestCase,
      });

      expect(result).toEqual({
        assertion,
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });
  });
});
