/**
 * Google AI providers module.
 *
 * Exports unified GoogleProvider and legacy provider classes.
 */

// Unified provider (recommended)
export { GoogleProvider } from './provider';

// Legacy providers (maintained for backwards compatibility)
export { AIStudioChatProvider } from './ai.studio';
export { VertexChatProvider, VertexEmbeddingProvider } from './vertex';

// Base classes and utilities
export { GoogleGenericProvider } from './base';
export type { GoogleProviderOptions } from './base';
export { GoogleAuthManager } from './auth';

// Types
export type { GoogleProviderConfig, CompletionOptions, Tool } from './types';
