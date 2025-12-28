import { describe, expect, it } from 'vitest';
import {
  PaginationParamsSchema,
  ApiErrorResponseSchema,
  MessageResponseSchema,
  SuccessMessageResponseSchema,
  EmailSchema,
  UuidSchema,
  TimestampSchema,
  UnixTimestampSchema,
  TimestampsSchema,
  SimpleErrorResponseSchema,
} from '../../src/dtos/common';

describe('Common DTOs', () => {
  describe('PaginationParamsSchema', () => {
    it('should use defaults when empty', () => {
      const result = PaginationParamsSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should coerce string values to numbers', () => {
      const result = PaginationParamsSchema.parse({ limit: '25', offset: '10' });
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(10);
    });

    it('should accept number values', () => {
      const result = PaginationParamsSchema.parse({ limit: 100, offset: 50 });
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(50);
    });

    it('should reject negative offset', () => {
      expect(() => PaginationParamsSchema.parse({ offset: -1 })).toThrow();
    });

    it('should reject non-positive limit', () => {
      expect(() => PaginationParamsSchema.parse({ limit: 0 })).toThrow();
      expect(() => PaginationParamsSchema.parse({ limit: -5 })).toThrow();
    });
  });

  describe('ApiErrorResponseSchema', () => {
    it('should validate error with message only', () => {
      const error = { error: 'Something went wrong' };
      expect(ApiErrorResponseSchema.parse(error)).toEqual(error);
    });

    it('should validate error with success flag', () => {
      const error = {
        success: false as const,
        error: 'Validation failed',
      };
      expect(ApiErrorResponseSchema.parse(error)).toEqual(error);
    });

    it('should validate error with details', () => {
      const error = {
        error: 'Invalid input',
        details: { field: 'email', message: 'Invalid format' },
      };
      expect(ApiErrorResponseSchema.parse(error)).toEqual(error);
    });

    it('should accept string details', () => {
      const error = {
        error: 'Failed',
        details: 'More information here',
      };
      expect(ApiErrorResponseSchema.parse(error)).toEqual(error);
    });
  });

  describe('MessageResponseSchema', () => {
    it('should validate message response', () => {
      const response = { message: 'Operation successful' };
      expect(MessageResponseSchema.parse(response)).toEqual(response);
    });

    it('should require message field', () => {
      expect(() => MessageResponseSchema.parse({})).toThrow();
    });
  });

  describe('SuccessMessageResponseSchema', () => {
    it('should validate success response', () => {
      const response = { success: true, message: 'Done' };
      expect(SuccessMessageResponseSchema.parse(response)).toEqual(response);
    });

    it('should validate failure response', () => {
      const response = { success: false, message: 'Failed to process' };
      expect(SuccessMessageResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('EmailSchema', () => {
    it('should accept valid email', () => {
      expect(EmailSchema.parse('user@example.com')).toBe('user@example.com');
    });

    it('should accept email with subdomain', () => {
      expect(EmailSchema.parse('user@mail.example.com')).toBe('user@mail.example.com');
    });

    it('should reject invalid email', () => {
      expect(() => EmailSchema.parse('not-an-email')).toThrow();
      expect(() => EmailSchema.parse('missing@domain')).toThrow();
      expect(() => EmailSchema.parse('@nodomain.com')).toThrow();
    });
  });

  describe('UuidSchema', () => {
    it('should accept valid UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(UuidSchema.parse(uuid)).toBe(uuid);
    });

    it('should reject invalid UUID', () => {
      expect(() => UuidSchema.parse('not-a-uuid')).toThrow();
      expect(() => UuidSchema.parse('123e4567-e89b-12d3-a456')).toThrow();
    });
  });

  describe('TimestampSchema', () => {
    it('should accept ISO datetime string with Z suffix', () => {
      const timestamp = '2024-01-15T10:30:00Z';
      expect(TimestampSchema.parse(timestamp)).toBe(timestamp);
    });

    it('should accept datetime with milliseconds', () => {
      const timestamp = '2024-01-15T10:30:00.000Z';
      expect(TimestampSchema.parse(timestamp)).toBe(timestamp);
    });

    it('should reject invalid datetime', () => {
      expect(() => TimestampSchema.parse('2024-01-15')).toThrow();
      expect(() => TimestampSchema.parse('not-a-date')).toThrow();
    });
  });

  describe('UnixTimestampSchema', () => {
    it('should accept valid unix timestamp', () => {
      const timestamp = 1705312200000;
      expect(UnixTimestampSchema.parse(timestamp)).toBe(timestamp);
    });

    it('should accept zero', () => {
      expect(UnixTimestampSchema.parse(0)).toBe(0);
    });

    it('should reject negative values', () => {
      expect(() => UnixTimestampSchema.parse(-1)).toThrow();
    });

    it('should reject non-integers', () => {
      expect(() => UnixTimestampSchema.parse(1705312200.5)).toThrow();
    });
  });

  describe('TimestampsSchema', () => {
    it('should validate timestamps object', () => {
      const timestamps = {
        createdAt: 1705312200000,
        updatedAt: 1705398600000,
      };
      expect(TimestampsSchema.parse(timestamps)).toEqual(timestamps);
    });

    it('should require both fields', () => {
      expect(() => TimestampsSchema.parse({ createdAt: 123 })).toThrow();
      expect(() => TimestampsSchema.parse({ updatedAt: 456 })).toThrow();
    });
  });

  describe('SimpleErrorResponseSchema', () => {
    it('should validate simple error', () => {
      const error = { error: 'Not found' };
      expect(SimpleErrorResponseSchema.parse(error)).toEqual(error);
    });

    it('should reject missing error field', () => {
      expect(() => SimpleErrorResponseSchema.parse({})).toThrow();
    });
  });
});
