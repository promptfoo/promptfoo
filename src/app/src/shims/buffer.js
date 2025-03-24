// Mock buffer implementation
const BufferImpl = {
  from: function(data, encoding) {
    if (typeof data === 'string') {
      return {
        toString: function(encoding) {
          return data;
        }
      };
    }
    return {
      toString: function() {
        return '';
      }
    };
  },
  isBuffer: function() {
    return false;
  },
  alloc: function() {
    return {};
  }
};

export default BufferImpl;

// Also expose on globalThis for any code expecting it globally
if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  globalThis.Buffer = BufferImpl;
} 