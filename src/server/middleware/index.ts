/**
 * Server Middleware
 *
 * Exports all middleware for use in route handlers.
 */

// Request validation
export { validateRequest, type ValidatedRequest, type ValidationSchemas } from './validateRequest';

// API response utilities
export {
  sendError,
  sendSuccess,
  HttpStatus,
  ErrorMessages,
  handleRouteError,
  getErrorMessage,
  getQueryString,
  getQueryNumber,
  getQueryBoolean,
  getParam,
  type ApiErrorResponse,
  type ApiSuccessResponse,
} from './apiResponse';
