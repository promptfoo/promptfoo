import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('CodeEditor', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('react-simple-code-editor');
  });

  it('uses the default export directly when it is a component', async () => {
    const MockEditor = ({ value }: { value: string }) => <div data-testid="editor">{value}</div>;

    vi.doMock('react-simple-code-editor', () => ({ default: MockEditor }));

    const { default: CodeEditor } = await import('./code-editor');
    render(<CodeEditor value="direct" onValueChange={vi.fn()} highlight={(v) => v} padding={0} />);
    expect(screen.getByTestId('editor')).toHaveTextContent('direct');
  });

  it('unwraps CJS double-default export', async () => {
    const MockEditor = ({ value }: { value: string }) => <div data-testid="editor">{value}</div>;

    vi.doMock('react-simple-code-editor', () => ({ default: { default: MockEditor } }));

    const { default: CodeEditor } = await import('./code-editor');
    render(
      <CodeEditor value="unwrapped" onValueChange={vi.fn()} highlight={(v) => v} padding={0} />,
    );
    expect(screen.getByTestId('editor')).toHaveTextContent('unwrapped');
  });
});
