/**
 * Google AI providers module.
 *
 * Exports unified GoogleProvider and legacy provider classes.
 */

// Legacy providers (maintained for backwards compatibility)
export { AIStudioChatProvider } from './ai.studio';
export { GoogleAuthManager } from './auth';
// Base classes and utilities
export { GoogleGenericProvider } from './base';
// Unified provider (recommended)
export { GoogleProvider } from './provider';
export { VertexChatProvider, VertexEmbeddingProvider } from './vertex';

export type { GoogleProviderOptions } from './base';
// Types
export type { CompletionOptions, GoogleProviderConfig, Tool } from './types';
