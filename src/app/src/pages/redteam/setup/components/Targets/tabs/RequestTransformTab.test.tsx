import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ['an empty saved transform', '', 'return defaultTransform(prompt);', ''],
    ['a saved transform', 'return prompt;', 'return defaultTransform(prompt);', 'return prompt;'],
    ['the default for an unset transform', undefined, 'return prompt;', 'return prompt;'],
    ['an empty value when neither is set', undefined, undefined, ''],
  ])('uses %s in both the editor and test dialog', async (_name, saved, fallback, expected) => {
    const user = userEvent.setup();
    render(
      <RequestTransformTab
        selectedTarget={{ config: { transformRequest: saved } } as HttpProviderOptions}
        updateCustomTarget={vi.fn()}
        defaultRequestTransform={fallback}
      />,
    );

    expect(screen.getByTestId('code-editor')).toHaveValue(expected);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(screen.getByTestId('transform-test-dialog').textContent).toBe(expected);
  });
});
