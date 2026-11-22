import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EXAMPLE_CONFIG } from '../hooks/useRedTeamConfig';
import SetupPlan, { ConnectionSummary } from './SetupPlan';

import type { SetupDraft } from '../hooks/useSetupAgent';

it.each([
  ['https://bot.example/chat?key=private', {}, 'bot.example'],
  ['openai:chat:gpt-4o', { apiBaseUrl: 'https://proxy.example/private/' }, 'proxy.example'],
  ['http', { url: '{{env.PRIVATE_URL}}' }, 'Custom endpoint'],
  ['http', { request: 'POST /private HTTP/1.1' }, 'http'],
  ['https', { url: '  ' }, 'Not connected'],
])(
  'summarizes a saved %s target without disclosing private request details',
  (id, config, label) => {
    const { container } = render(
      <ConnectionSummary target={{ id, config }} draft={{ messages: [], input: '' }} />,
    );
    expect(screen.getByText(label)).toBeVisible();
    expect(container.textContent).not.toMatch(/private/i);
  },
);

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
