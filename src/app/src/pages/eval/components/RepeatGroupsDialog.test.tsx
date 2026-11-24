import { callApi } from '@app/utils/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RepeatGroupsDialog from './RepeatGroupsDialog';

vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApi: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

it('fetches group totals on open and loads run outputs only when expanded', async () => {
  const prompt = { raw: 'prompt', label: 'Greeting', provider: 'echo' };
  vi.mocked(callApi)
    .mockResolvedValueOnce(
      Response.json({
        groups: [
          {
            id: 'test-0-vars-0',
            description: 'Greeting test',
            firstTestIdx: 0,
            prompts: [{ promptIdx: 0, passed: 18, failed: 1, errors: 1 }],
          },
        ],
        hasMore: false,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        table: {
          head: { prompts: [prompt], vars: [] },
          body: [
            {
              testIdx: 7,
              outputs: [
                {
                  repeatGroupId: 'test-0-vars-0',
                  repeatIndex: 3,
                  text: 'Hello!',
                  pass: true,
                },
              ],
            },
          ],
        },
        filteredCount: 1,
      }),
    );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepeatGroupsDialog evalId="eval-1" prompts={[prompt]} />
    </QueryClientProvider>,
  );
  expect(callApi).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Repeated tests' }));
  const group = await screen.findByRole('button', {
    name: /Greeting test.*18 PASS · 1 FAIL · 1 ERROR/,
  });
  expect(group).toHaveAttribute('aria-expanded', 'false');
  expect(callApi).toHaveBeenCalledTimes(1);
  fireEvent.click(group);
  expect(await screen.findByText('Hello!')).toBeVisible();
  expect(screen.getByRole('rowheader', { name: '4' })).toBeVisible();
  expect(vi.mocked(callApi).mock.calls[1][0]).toContain('repeatGroupId=test-0-vars-0');
  fireEvent.click(group);
  expect(screen.queryByText('Hello!')).not.toBeInTheDocument();
});
