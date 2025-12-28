/**
 * Data Transfer Objects (DTOs) for API request/response validation.
 *
 * This module provides Zod schemas for validating API payloads on both
 * the server and client sides. Each schema includes an inferred TypeScript
 * type for full type safety.
 *
 * Usage:
 *   import { GetUserEmailResponseSchema, type GetUserEmailResponse } from '@promptfoo/dtos';
 *
 * For server-side validation:
 *   const response = GetUserEmailResponseSchema.parse(data);
 *
 * For client-side validation:
 *   const result = GetUserEmailResponseSchema.safeParse(data);
 *   if (!result.success) console.error(result.error);
 */

// Common schemas and utilities
export * from './common';

// Domain-specific DTOs
export * from './blobs.dto';
export * from './cloud.dto';
export * from './configs.dto';
export * from './eval.dto';
export * from './media.dto';
export * from './modelAudit.dto';
export * from './providers.dto';
export * from './redteam.dto';
export * from './socket.dto';
export * from './traces.dto';
export * from './user.dto';
export * from './version.dto';
