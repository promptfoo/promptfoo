/**
 * CodeScan Types Tests
 */

import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { CodeScanSeverity, validateSeverity } from '../../src/types/codeScan';

describe('validateSeverity', () => {
  describe('valid severity values', () => {
    it('should validate lowercase severity values', () => {
      expect(validateSeverity('critical')).toBe(CodeScanSeverity.CRITICAL);
      expect(validateSeverity('high')).toBe(CodeScanSeverity.HIGH);
      expect(validateSeverity('medium')).toBe(CodeScanSeverity.MEDIUM);
      expect(validateSeverity('low')).toBe(CodeScanSeverity.LOW);
      expect(validateSeverity('none')).toBe(CodeScanSeverity.NONE);
    });

    it('should normalize uppercase severity values', () => {
      expect(validateSeverity('CRITICAL')).toBe(CodeScanSeverity.CRITICAL);
      expect(validateSeverity('HIGH')).toBe(CodeScanSeverity.HIGH);
      expect(validateSeverity('MEDIUM')).toBe(CodeScanSeverity.MEDIUM);
      expect(validateSeverity('LOW')).toBe(CodeScanSeverity.LOW);
      expect(validateSeverity('NONE')).toBe(CodeScanSeverity.NONE);
    });

    it('should normalize mixed case severity values', () => {
      expect(validateSeverity('CriTicAL')).toBe(CodeScanSeverity.CRITICAL);
      expect(validateSeverity('HiGh')).toBe(CodeScanSeverity.HIGH);
      expect(validateSeverity('MeDiUm')).toBe(CodeScanSeverity.MEDIUM);
      expect(validateSeverity('LoW')).toBe(CodeScanSeverity.LOW);
      expect(validateSeverity('NoNe')).toBe(CodeScanSeverity.NONE);
    });

    it('should trim whitespace from severity values', () => {
      expect(validateSeverity('  critical  ')).toBe(CodeScanSeverity.CRITICAL);
      expect(validateSeverity('\thigh\t')).toBe(CodeScanSeverity.HIGH);
      expect(validateSeverity('\nmedium\n')).toBe(CodeScanSeverity.MEDIUM);
      expect(validateSeverity(' low ')).toBe(CodeScanSeverity.LOW);
    });

    it('should handle combination of whitespace and case normalization', () => {
      expect(validateSeverity('  CRITICAL  ')).toBe(CodeScanSeverity.CRITICAL);
      expect(validateSeverity('\t HiGh \n')).toBe(CodeScanSeverity.HIGH);
    });
  });

  describe('invalid severity values', () => {
    it('should throw ZodError for invalid severity level', () => {
      expect(() => validateSeverity('invalid')).toThrow(ZodError);
    });

    it('should throw ZodError for empty string', () => {
      expect(() => validateSeverity('')).toThrow(ZodError);
    });

    it('should throw ZodError for numeric values', () => {
      expect(() => validateSeverity('1')).toThrow(ZodError);
      expect(() => validateSeverity('123')).toThrow(ZodError);
    });

    it('should throw ZodError for severity with special characters', () => {
      expect(() => validateSeverity('high!')).toThrow(ZodError);
      expect(() => validateSeverity('medium@')).toThrow(ZodError);
      expect(() => validateSeverity('low#')).toThrow(ZodError);
    });

    it('should throw ZodError for partial matches', () => {
      expect(() => validateSeverity('hig')).toThrow(ZodError);
      expect(() => validateSeverity('critic')).toThrow(ZodError);
    });

    it('should throw ZodError for severity with extra characters', () => {
      expect(() => validateSeverity('highh')).toThrow(ZodError);
      expect(() => validateSeverity('criticall')).toThrow(ZodError);
    });

    it('should provide meaningful error message', () => {
      try {
        validateSeverity('invalid');
        expect.fail('Expected ZodError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues[0].message).toBeTruthy();
      }
    });
  });
});
