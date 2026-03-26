import EditorImport from 'react-simple-code-editor';

// CJS/ESM interop: default import may be wrapped as { default: Component }
const CodeEditor =
  typeof EditorImport === 'function'
    ? EditorImport
    : (EditorImport as unknown as { default: typeof EditorImport }).default;

export default CodeEditor;
