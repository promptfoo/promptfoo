import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EXAMPLE_CONFIG } from '../hooks/useRedTeamConfig';
import SetupPlan from './SetupPlan';

import type { SetupDraft } from '../hooks/useSetupAgent';

it('locks edits while a reply is pending and updates the same card when the connection result changes', async () => {
  const user = userEvent.setup();
  const draft: SetupDraft = {
    step: 'ready',
    messages: [],
    input: '',
    demo: true,
    plan: { purpose: 'Order bot', plugins: [{ id: 'bola', reason: 'Check order access.' }] },
  };
  const props = { draft, config: EXAMPLE_CONFIG, setDraft: vi.fn(), edit: vi.fn() };
  const { rerender } = render(<SetupPlan {...props} status="untested" disabled={false} />);
  const target = screen.getByRole('button', { name: 'Change target' });
  rerender(<SetupPlan {...props} status="untested" disabled />);
  expect(target).toBeDisabled();
  await user.click(target);
  expect(props.edit).not.toHaveBeenCalled();
  rerender(<SetupPlan {...props} status="error" disabled={false} />);
  expect(screen.getByText('Test failed')).toBeVisible();
  expect(target).toBeEnabled();
  await user.click(target);
  expect(props.edit).toHaveBeenCalledWith('url');
  rerender(<SetupPlan {...props} status="success" disabled={false} />);
  expect(screen.queryByText('Test failed')).toBeNull();
  expect(screen.getByText('Test passed')).toBeVisible();
  expect(screen.getByText('Check order access.')).toBeVisible();
});
