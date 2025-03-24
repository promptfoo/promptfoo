// Mock global implementation - just use globalThis
const globalImpl = (typeof globalThis !== 'undefined') ? globalThis : 
                  (typeof window !== 'undefined') ? window : 
                  (typeof global !== 'undefined') ? global : 
                  (typeof self !== 'undefined') ? self : {};

// Ensure Buffer and process are present on our global object
if (!globalImpl.Buffer && typeof globalThis.Buffer !== 'undefined') {
  globalImpl.Buffer = globalThis.Buffer;
}

if (!globalImpl.process && typeof globalThis.process !== 'undefined') {
  globalImpl.process = globalThis.process;
}

export default globalImpl; 