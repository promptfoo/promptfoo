import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ExtensionEditor from './ExtensionEditor';

function ControlledExtensionEditor({
  initialExtensions = [],
  onValidationChange,
}: {
  initialExtensions?: string[];
  onValidationChange?: (hasErrors: boolean) => void;
}) {
  const [extensions, setExtensions] = useState(initialExtensions);

  return (
    <ExtensionEditor
      extensions={extensions}
      onExtensionsChange={setExtensions}
      onValidationChange={onValidationChange}
    />
  );
}

describe('ExtensionEditor', () => {
  it('waits until typing settles before reporting a missing hook function', async () => {
    const user = userEvent.setup();
    const onValidationChange = vi.fn();
    render(<ControlledExtensionEditor onValidationChange={onValidationChange} />);

    await user.click(screen.getByText('Extension Hook'));
    const input = screen.getByLabelText('Extension File Path');
    await user.type(input, './hooks.js');

    expect(screen.queryByText(/Incorrect format/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Incorrect format/)).toBeInTheDocument();
    });
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Incorrect format/);
  });

  it('reports an invalid existing extension path to the parent validator', async () => {
    const user = userEvent.setup();
    const onValidationChange = vi.fn();
    render(
      <ControlledExtensionEditor
        initialExtensions={['file://./hooks.txt:beforeAll']}
        onValidationChange={onValidationChange}
      />,
    );

    await user.click(screen.getByText('Extension Hook'));

    expect(screen.getByText('Must be a JavaScript/TypeScript or Python file')).toBeInTheDocument();
    expect(screen.getByLabelText('Extension File Path')).toHaveAccessibleDescription(
      'Must be a JavaScript/TypeScript or Python file',
    );
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });
});
