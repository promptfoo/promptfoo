import EditorImport from 'react-simple-code-editor';

type CodeEditorComponent = typeof EditorImport;

function hasDefaultExport(value: unknown): value is { default: unknown } {
  return typeof value === 'object' && value !== null && 'default' in value;
}

function unwrapDefaultExport(value: unknown): CodeEditorComponent {
  let component = value;

  // react-simple-code-editor is CJS-compatible, and Vite can prebundle it into
  // nested default exports (for example: { default: { default: Component } }).
  // Unwrap until we reach the actual React component object.
  while (hasDefaultExport(component)) {
    component = component.default;
  }

  return component as CodeEditorComponent;
}

// CJS/ESM interop: Vite can wrap the default export multiple times.
const CodeEditor = unwrapDefaultExport(EditorImport);

export default CodeEditor;
