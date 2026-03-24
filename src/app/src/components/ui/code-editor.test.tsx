import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('CodeEditor', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('react-simple-code-editor');
  });

  it('unwraps CommonJS default export objects', async () => {
    const MockEditor = ({ value }: { value: string }) => <div data-testid="editor">{value}</div>;

    vi.resetModules();
    vi.doMock('react-simple-code-editor', () => ({
      default: {
        default: MockEditor,
      },
    }));

    const { default: CodeEditor } = await import('./code-editor');

    render(
      <CodeEditor
        value="test content"
        onValueChange={vi.fn()}
        highlight={(value) => value}
        padding={0}
      />,
    );

    expect(screen.getByTestId('editor')).toHaveTextContent('test content');
  });
});
