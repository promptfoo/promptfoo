import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RequestTransformTab from './RequestTransformTab';

import type { HttpProviderOptions } from '../../../types';

vi.mock('@app/components/ui/code-editor', () => ({
  default: ({ value }: { value: string }) => (
    <textarea data-testid="code-editor" value={value} readOnly />
  ),
}));
vi.mock('../TransformTestDialog', () => ({
  default: ({ open, transformCode }: { open: boolean; transformCode: string }) =>
    open ? <div data-testid="transform-test-dialog">{transformCode}</div> : null,
}));

describe('RequestTransformTab', () => {
  it('preserves an intentionally empty saved transform instead of restoring the default', async () => {
    const user = userEvent.setup();
    render(
      <RequestTransformTab
        selectedTarget={{ config: { transformRequest: '' } } as HttpProviderOptions}
        updateCustomTarget={vi.fn()}
        defaultRequestTransform="return defaultTransform(prompt);"
      />,
    );

    expect(screen.getByTestId('code-editor')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(screen.getByTestId('transform-test-dialog')).toHaveTextContent('');
  });
});
