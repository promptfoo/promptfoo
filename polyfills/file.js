// Preload polyfill so Node 18 has global File (needed by undici/webidl)
if (typeof globalThis.File === 'undefined') {
  class NodeFile extends globalThis.Blob {
    constructor(parts, name, opts = {}) {
      super(parts, opts);
      this.name = String(name);
      this.lastModified = opts.lastModified ?? Date.now();
    }
    get [Symbol.toStringTag]() {
      return 'File';
    }
  }
  globalThis.File = NodeFile;
}
