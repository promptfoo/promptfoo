import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ExtensionEditor from './ExtensionEditor';

function StatefulExtensionEditor({
  onValidationChange,
}: {
  onValidationChange: (hasErrors: boolean) => void;
}) {
  const [extensions, setExtensions] = useState<string[]>([]);
  return (
    <ExtensionEditor
      extensions={extensions}
      onExtensionsChange={setExtensions}
      onValidationChange={onValidationChange}
    />
  );
}

describe('ExtensionEditor', () => {
  it.each([
    'file://C:/work/hook.js:beforeAll',
    'file://C:\\work\\hook.js:beforeAll',
    'file:///D:/work/hook.py:beforeAll',
  ])('accepts the saved Windows extension %s', async (reference) => {
    const user = userEvent.setup();
    render(<ExtensionEditor extensions={[reference]} onExtensionsChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Extension Hook/ }));
    expect(screen.getByLabelText('Extension File Path')).toHaveValue(
      reference.slice('file://'.length),
    );
    expect(
      screen.getByText('Path to your extension file and exported function name'),
    ).toBeInTheDocument();
  });

  it.each([
    { typed: ':beforeAll', hasErrors: true },
    { typed: ' :beforeAll', hasErrors: true },
    { typed: 'C:/work/hook.js:beforeAll', hasErrors: false },
    { typed: '/work/hook.js:beforeAll', hasErrors: false },
  ])("reports hasErrors=$hasErrors while typing '$typed'", async ({ typed, hasErrors }) => {
    const user = userEvent.setup();
    const onValidationChange = vi.fn();
    render(<StatefulExtensionEditor onValidationChange={onValidationChange} />);
    await user.click(screen.getByRole('button', { name: /Extension Hook/ }));
    await user.type(screen.getByLabelText('Extension File Path'), typed);
    expect(screen.getByLabelText('Extension File Path')).toHaveValue(typed);
    expect(onValidationChange).toHaveBeenLastCalledWith(hasErrors);
  });
});
