import EditorImport from 'react-simple-code-editor';

type CodeEditorComponent = typeof import('react-simple-code-editor').default;

const editorModule = EditorImport as CodeEditorComponent | { default: CodeEditorComponent };

const CodeEditor =
  typeof editorModule === 'object' && editorModule !== null && 'default' in editorModule
    ? editorModule.default
    : editorModule;

export default CodeEditor;
