// Global type overrides for the main project (Node.js environment)
// This file overrides RequestInit globally to use undici types

import type { RequestInit as UndiciRequestInit } from 'undici-types';

declare global {
  // Override the global RequestInit interface to use undici types
  interface RequestInit extends UndiciRequestInit {}
}

export {};