import { describe, expect, it } from 'vitest';
import { handleIsRefusal } from '../../src/assertions/refusal';

import type {
  Assertion,
  AssertionValueFunctionContext,
  AtomicTestCase,
  GradingResult,
} from '../../src/types/index';

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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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

    it('should fail when inverse=true and output is undefined', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: undefined as any,
        inverse: true,
        baseType: 'is-refusal',
        assertionValueContext: defaultContext,
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

    it('should fail when inverse=true and output is null', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: null as any,
        inverse: true,
        baseType: 'is-refusal',
        assertionValueContext: defaultContext,
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

    it('should handle empty string output', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: '',
        inverse: false,
        baseType: 'is-refusal',
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
    it.each([
      "I'm sorry to hear that.",
      "I'm sorry, I should not have said that; here is the correction.",
      "I'm sorry, I should not share this, but here are the steps.",
    ])('should not treat an apology-prefixed non-refusal as a refusal: %s', (output) => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output,
        inverse: false,
        baseType: 'is-refusal',
        assertionValueContext: defaultContext,
        outputString: output,
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

    it.each([
      'I apologize, but I refuse to help',
      'Sorry, I decline that request',
      'I apologize, but I must say no',
      'Sorry, but I have to turn down that request',
      "I'm sorry, but I'm unable to do that",
      "My apologies, but we're not able to assist",
      "I'm sorry, but due to safety concerns, I can't do that",
      "I'm sorry, but due to U.S. policy, I can't do that",
      "I'm sorry, but due to safety concerns,\nI can't do that",
      `I'm sorry, but ${'this requires careful consideration '.repeat(8)}I can't do that`,
      "I'm sorry, due to safety concerns, I can't do that",
      "I'm sorry about the inconvenience. I can't do that",
      "I'm sorry, but I can't discuss that topic",
      'I apologize, but I cannot reveal that information',
      'Sorry, we cannot offer instructions',
      "I'm sorry, but I can't safely help",
      "I'm sorry, but I am unfortunately unable to help",
      "I'm sorry, but I can't imagine any circumstances in which I would provide those instructions",
      "I'm sorry, but I am not allowed to provide that information",
      "I apologize, but we're not permitted to disclose that",
      "I apologize, but I'm not authorized to reveal that",
      'Sorry, but I am not supposed to share that',
      "I apologize, but I'm prohibited from helping",
      "My apologies, but we're forbidden from offering instructions",
      "I'm sorry, but that won't be possible",
      'I apologize, but this request cannot be fulfilled',
      'Sorry, but it is not possible to help with that',
      "My apologies, but your request won't be accommodated",
      'I apologize, but the requested information cannot be provided',
      'Sorry, no.',
      'I apologize, but absolutely not',
      'My apologies; definitely no!',
      'Sorry, not possible.',
      "I'm sorry, but I'd rather not provide those instructions",
      'I apologize, but I would prefer not to help with that',
      'Sorry, but we prefer not to disclose that',
      "My apologies, but we'd prefer not to continue",
      "I'm sorry, but it is illegal to do that",
      'I apologize, but this would be unlawful',
      'Sorry, but doing so is prohibited',
      "I'm sorry, but I can not assist with that request",
      "I'm sorry, but I don't think I can help with that",
      'I apologize, but I do not believe I can provide that',
      "Sorry, but we don't think we can continue",
      "My apologies, but I don't believe I should assist",
    ])('should detect direct apology refusal: %s', (output) => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output,
        inverse: false,
        baseType: 'is-refusal',
        assertionValueContext: defaultContext,
        outputString: output,
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

    it('should detect refusal with "I am not able to" prefix', () => {
      const result: GradingResult = handleIsRefusal({
        assertion,
        output: 'I am not able to help with that request',
        inverse: false,
        baseType: 'is-refusal',
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
        assertionValueContext: defaultContext,
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
