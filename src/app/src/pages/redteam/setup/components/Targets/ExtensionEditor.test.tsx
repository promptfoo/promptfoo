import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ExtensionEditor from './ExtensionEditor';

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
});
