import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EXAMPLE_CONFIG } from '../hooks/useRedTeamConfig';
import SetupPlan from './SetupPlan';

import type { SetupDraft } from '../hooks/useSetupAgent';

it('locks edits while a reply is pending and updates the same card when the connection result changes', async () => {
  const user = userEvent.setup();
  const draft: SetupDraft = {
    messages: [],
    input: '',
    demo: true,
    plan: { purpose: 'Order bot', plugins: [{ id: 'bola', reason: 'Check order access.' }] },
  };
  const props = { draft, config: EXAMPLE_CONFIG, setDraft: vi.fn() };
  const { rerender } = render(<SetupPlan {...props} status="untested" disabled={false} />);
  const toggle = screen.getByRole('checkbox', { name: 'Access to other users’ records' });
  rerender(<SetupPlan {...props} status="untested" disabled />);
  expect(toggle).toBeDisabled();
  await user.click(toggle);
  expect(props.setDraft).not.toHaveBeenCalled();
  rerender(<SetupPlan {...props} status="error" disabled={false} />);
  expect(screen.getByText('Test failed')).toBeVisible();
  expect(toggle).toBeEnabled();
  await user.click(toggle);
  expect(props.setDraft).toHaveBeenCalledWith(expect.objectContaining({ excluded: ['bola'] }));
  rerender(<SetupPlan {...props} status="success" disabled={false} />);
  expect(screen.queryByText('Test failed')).toBeNull();
  expect(screen.getByText('Test passed')).toBeVisible();
  expect(screen.getByText('Check order access.')).toBeVisible();
});
