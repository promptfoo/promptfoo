/**
 * API Schema Exports
 *
 * This provides a centralized, type-safe API contract shared between
 * frontend and backend with runtime validation.
 *
 * Usage:
 *
 * Backend:
 *   import { api } from './schemas';
 *   const { id } = api.eval.byId.delete.params.parse(req.params);
 *
 * Frontend:
 *   import { api } from '@promptfoo/server/schemas';
 *   const data = await callApiValidated('/user/email', api.user.email.get.res);
 */

export { Field, Schema } from './common';
export { api, type ApiParams, type ApiQuery, type ApiBody, type ApiResponse } from './api';

// Re-export for backwards compatibility during migration
export { api as ApiSchemas } from './api';
