// Browser-specific global type overrides for the app directory
// This file ensures RequestInit uses standard DOM types in the browser environment

declare global {
  // Explicitly use the DOM RequestInit interface for browser compatibility
  // This overrides any global undici types that might leak into the app
  interface RequestInit extends globalThis.RequestInit {}
}

export {};