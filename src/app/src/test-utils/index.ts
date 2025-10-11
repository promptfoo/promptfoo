/**
 * Test utilities for Vitest tests
 *
 * This module provides common testing utilities, helpers, and patterns
 * for writing clean and maintainable tests.
 *
 * @module test-utils
 */

// Console utilities
export { suppressConsoleErrors, createConsoleErrorSpy } from './console';

// Render utilities
export { renderWithProviders, renderWithRouter, createTestTheme } from './render';
export type { ProviderOptions } from './render';

// Mock utilities
export {
  createMockResponse,
  createMockToast,
  mockCallApi,
  createMockNavigate,
  setupMockUser,
  waitForNextTick,
  createDeferred,
} from './mocks';
