import { mockCallApiResponseOnce } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import RepeatGroupsDialog from './RepeatGroupsDialog';

vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApi: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

const prompt = { raw: 'prompt', label: 'Greeting', provider: 'echo' };

function renderOverview() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepeatGroupsDialog evalId="eval-1" prompts={[prompt]} />
    </QueryClientProvider>,
  );
}

it('fetches group totals on open and loads run outputs only when expanded', async () => {
  const user = userEvent.setup();
  mockCallApiResponseOnce({
    groups: [
      {
        id: 'test-0-vars-0',
        description: 'Greeting test',
        firstTestIdx: 0,
        prompts: [{ promptIdx: 0, passed: 18, failed: 1, errors: 1 }],
      },
    ],
    hasMore: false,
  });
  mockCallApiResponseOnce({
    table: {
      head: { prompts: [prompt], vars: [] },
      body: [
        {
          testIdx: 7,
          outputs: [
            {
              repeatGroupId: 'test-0-vars-0',
              repeatIndex: 3,
              metadata: {
                redteamHistory: [{}, { outputAudio: { format: 'wav', data: 'YXVkaW8=' } }],
              },
              text: 'first line\n  indented line',
              pass: true,
            },
          ],
        },
      ],
    },
    filteredCount: 1,
  });
  renderOverview();
  expect(callApi).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Repeated tests' }));
  const group = await screen.findByRole('button', {
    name: /Greeting test.*18 PASS · 1 FAIL · 1 ERROR/,
  });
  expect(group).toHaveAttribute('aria-expanded', 'false');
  expect(callApi).toHaveBeenCalledTimes(1);
  await user.click(group);
  const output = await screen.findByText('first line indented line');
  const player = screen.getByTestId('response-audio-player');
  expect(player).toHaveAttribute('controls');
  expect(player.querySelector('source')).toHaveAttribute('src', 'data:audio/wav;base64,YXVkaW8=');
  expect(output.textContent).toBe('first line\n  indented line');
  expect(output.closest('td')).toHaveClass('whitespace-pre-wrap');
  expect(screen.getByRole('rowheader', { name: '4' })).toBeVisible();
  expect(vi.mocked(callApi).mock.calls[1][0]).toContain('repeatGroupId=test-0-vars-0');
  await user.click(group);
  expect(screen.queryByText('first line indented line')).not.toBeInTheDocument();
});

it('opens the image preview outside the repeat dialog and returns to the group on Escape', async () => {
  const user = userEvent.setup();
  mockCallApiResponseOnce({
    groups: [{ id: 'images', firstTestIdx: 0, prompts: [] }],
    hasMore: false,
  });
  mockCallApiResponseOnce({
    table: {
      head: { prompts: [prompt], vars: [] },
      body: [
        {
          testIdx: 0,
          outputs: [
            {
              repeatGroupId: 'images',
              repeatIndex: 0,
              pass: true,
              prompt: 'Image output',
              images: [{ data: 'aW1hZ2U=', mimeType: 'image/png' }],
            },
          ],
        },
      ],
    },
    filteredCount: 1,
  });
  renderOverview();
  await user.click(screen.getByRole('button', { name: 'Repeated tests' }));
  const overview = screen.getByRole('dialog', { name: 'Repeated tests' });
  await user.click(await within(overview).findByRole('button', { name: /Test 1/ }));
  await user.click(await within(overview).findByRole('img', { name: 'Image output' }));
  const preview = screen.getByRole('dialog', { name: 'Image preview' });
  expect(overview).not.toContainElement(preview);
  await user.keyboard('{Escape}');
  expect(preview).not.toBeInTheDocument();
  expect(within(overview).getByRole('rowheader', { name: '1' })).toBeVisible();
});

it('pages recorded runs independently from group summaries', async () => {
  const user = userEvent.setup();
  const group = {
    id: 'A',
    firstTestIdx: 5,
    description: null,
    prompts: [{ promptIdx: 0, passed: 20, failed: 0, errors: 1 }],
  };
  const summary = { groups: [group], hasMore: true };
  const details = {
    table: { head: { prompts: [prompt], vars: [] }, body: [{ testIdx: 5, outputs: [null] }] },
    filteredCount: 21,
  };
  mockCallApiResponseOnce(summary);
  mockCallApiResponseOnce(details);
  mockCallApiResponseOnce({
    ...details,
    table: {
      ...details.table,
      body: [
        {
          testIdx: 25,
          outputs: [
            {
              repeatGroupId: 'A',
              repeatIndex: 20,
              failureReason: 2,
              pass: false,
              text: 'provider unavailable',
            },
          ],
        },
      ],
    },
  });
  mockCallApiResponseOnce(details);
  mockCallApiResponseOnce({ groups: [], hasMore: false });
  mockCallApiResponseOnce(summary);
  renderOverview();
  await user.click(screen.getByRole('button', { name: 'Repeated tests' }));
  await user.click(await screen.findByRole('button', { name: /Test 6/ }));
  expect(await screen.findByRole('rowheader', { name: '—' })).toBeVisible();
  const runs = () => within(screen.getByRole('navigation', { name: 'Run pages' }));
  await user.click(runs().getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('provider unavailable')).toBeVisible();
  expect(screen.getByRole('rowheader', { name: '21' })).toBeVisible();
  expect(runs().getByRole('button', { name: 'Next' })).toBeDisabled();
  await user.click(runs().getByRole('button', { name: 'Previous' }));
  expect(await screen.findByRole('rowheader', { name: '—' })).toBeVisible();
  const groups = () => within(screen.getByRole('navigation', { name: 'Repeated test pages' }));
  await user.click(groups().getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('No recorded repeat groups.')).toBeVisible();
  await user.click(groups().getByRole('button', { name: 'Previous' }));
  expect(await screen.findByRole('button', { name: /Test 6/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it.each(['overview', 'runs'])('shows a failed %s request', async (request) => {
  const user = userEvent.setup();
  if (request === 'runs') {
    mockCallApiResponseOnce({
      groups: [{ id: 'A', description: 'First test', firstTestIdx: 0, prompts: [] }],
      hasMore: false,
    });
  }
  mockCallApiResponseOnce({}, { status: 503 });
  renderOverview();
  await user.click(screen.getByRole('button', { name: 'Repeated tests' }));
  if (request === 'runs') {
    await user.click(await screen.findByRole('button', { name: /First test/ }));
  }
  expect(await screen.findByRole('alert')).toHaveTextContent(
    request === 'runs' ? 'Could not load runs.' : 'Could not load repeated tests.',
  );
});
