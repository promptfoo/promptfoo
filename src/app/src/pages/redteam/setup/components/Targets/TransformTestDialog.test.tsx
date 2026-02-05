import type { ComponentProps } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TransformTestDialog from './TransformTestDialog';

vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

const renderWithTooltipProvider = (component: React.ReactNode) => {
  return render(<TooltipProvider>{component}</TooltipProvider>);
};

const defaultProps: ComponentProps<typeof TransformTestDialog> = {
  open: true,
  onClose: vi.fn(),
  title: 'Test Transform Dialog',
  transformCode: 'return "transformed";',
  onTransformCodeChange: vi.fn(),
  testInput: '{ "message": "hello world" }',
  onTestInputChange: vi.fn(),
  testInputLabel: 'Test Input Label',
  testInputPlaceholder: 'Enter test input...',
  onTest: vi.fn().mockResolvedValue({ success: true, result: 'ok' }),
  onApply: vi.fn(),
  functionDocumentation: {
    signature: 'test signature',
    description: 'test description',
    successMessage: 'Test successful!',
    outputLabel: 'Test Output:',
  },
};

describe('TransformTestDialog', () => {
  it('should display the test input Accordion expanded by default with the correct testInput value', () => {
    renderWithTooltipProvider(<TransformTestDialog {...defaultProps} />);

    const collapsibleTrigger = screen.getByRole('button', { name: /test input/i });
    expect(collapsibleTrigger).toHaveAttribute('data-state', 'open');

    const editor = screen.getByDisplayValue(defaultProps.testInput);
    expect(editor).toBeInTheDocument();
  });

  it('should format the test input as pretty-printed JSON and clear any error when the Format JSON button is clicked and the input is valid JSON', () => {
    const onTestInputChange = vi.fn();
    const testInput = '{"message":"hello world"}';
    renderWithTooltipProvider(
      <TransformTestDialog
        {...defaultProps}
        testInput={testInput}
        onTestInputChange={onTestInputChange}
      />,
    );

    const formatButton = screen.getByLabelText('Format JSON');
    fireEvent.click(formatButton);

    expect(onTestInputChange).toHaveBeenCalledWith(JSON.stringify(JSON.parse(testInput), null, 2));
    const errorAlert = screen.queryByText(/invalid json/i);
    expect(errorAlert).not.toBeInTheDocument();
  });

  it('should display a success alert with functionDocumentation.successMessage and the output in the code editor when a test is run and onTest returns a successful result', async () => {
    const props = {
      ...defaultProps,
      onTest: vi.fn().mockResolvedValue({ success: true, result: { output: 'test output' } }),
      functionDocumentation: {
        ...defaultProps.functionDocumentation,
        successMessage: 'Transform successful!',
      },
    };
    renderWithTooltipProvider(<TransformTestDialog {...props} />);

    const runTestButton = screen.getByRole('button', { name: /Run Test/i });
    fireEvent.click(runTestButton);

    await waitFor(() => {
      expect(screen.getByText(props.functionDocumentation.successMessage)).toBeInTheDocument();
      const outputEditor = screen
        .getAllByTestId('code-editor')
        .find((editor) => (editor as HTMLTextAreaElement).value.includes('"output"'));
      expect(outputEditor).toHaveValue(JSON.stringify({ output: 'test output' }, null, 2));
    });
  });

  it('should display an info alert with "No transform applied - showing base behavior" when transform code is empty and test result is successful', async () => {
    const props = {
      ...defaultProps,
      transformCode: '',
      onTest: vi.fn().mockResolvedValue({ success: true, result: 'ok' }),
    };
    renderWithTooltipProvider(<TransformTestDialog {...props} />);

    const runTestButton = screen.getByRole('button', { name: /run test/i });
    fireEvent.click(runTestButton);

    const alert = await screen.findByText('No transform applied - showing base behavior');
    expect(alert).toBeInTheDocument();
  });

  it('should call `onApply` with the current `transformCode` and call `onClose` when the Apply Transform button is clicked after a successful test result', async () => {
    renderWithTooltipProvider(<TransformTestDialog {...defaultProps} />);

    const runTestButton = screen.getByRole('button', { name: /Run Test/i });
    fireEvent.click(runTestButton);

    await screen.findByRole('button', { name: /Apply Transform/i });
    const applyButton = screen.getByRole('button', { name: /Apply Transform/i });
    fireEvent.click(applyButton);

    expect(defaultProps.onApply).toHaveBeenCalledWith(defaultProps.transformCode);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should reset the test result to null each time the dialog is opened', async () => {
    const { rerender } = render(
      <TooltipProvider>
        <TransformTestDialog {...defaultProps} open={false} />
      </TooltipProvider>,
    );

    expect(screen.queryByText('Test Transform Dialog')).not.toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <TransformTestDialog {...defaultProps} open={true} />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Run the test to see results')).toBeInTheDocument();
    });

    rerender(
      <TooltipProvider>
        <TransformTestDialog {...defaultProps} open={false} />
      </TooltipProvider>,
    );
    rerender(
      <TooltipProvider>
        <TransformTestDialog {...defaultProps} open={true} />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Run the test to see results')).toBeInTheDocument();
    });
  });

  it('should display an error message when Format JSON button is clicked with invalid JSON and clear it after a timeout', async () => {
    const testInput = 'invalid json';
    const onTestInputChange = vi.fn();
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    renderWithTooltipProvider(
      <TransformTestDialog
        {...defaultProps}
        testInput={testInput}
        onTestInputChange={onTestInputChange}
      />,
    );

    const formatButton = screen.getByRole('button', { name: /format json/i });
    fireEvent.click(formatButton);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/invalid json/i);

    const filteredCalls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 3000);
    const timeoutCallback = filteredCalls[filteredCalls.length - 1]?.[0] as
      | (() => void)
      | undefined;
    act(() => {
      timeoutCallback?.();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    setTimeoutSpy.mockRestore();
  });

  it('should display deeply nested JSON objects in the test result output', async () => {
    const nestedJSONObject = {
      level1: {
        level2: {
          level3: {
            message: 'Hello, world!',
            number: 42,
            boolean: true,
            array: [1, 2, 3],
          },
        },
      },
    };

    const onTestMock = vi.fn().mockResolvedValue({ success: true, result: nestedJSONObject });

    renderWithTooltipProvider(<TransformTestDialog {...defaultProps} onTest={onTestMock} />);

    const runTestButton = screen.getByRole('button', { name: /Run Test/i });
    fireEvent.click(runTestButton);

    await screen.findByText('Test successful!');

    const expectedOutput = JSON.stringify(nestedJSONObject, null, 2);
    const editor = await screen.findByText(/"level1":/);
    expect(editor).toBeInTheDocument();
    expect(editor.textContent).toContain(expectedOutput.substring(0, 20));
  });
});
