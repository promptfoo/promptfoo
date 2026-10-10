import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatasetsPage from './page';

const callApiMock = vi.fn();
vi.mock('@app/utils/api', () => ({
  callApi: (...args: any[]) => callApiMock(...args),
}));

describe('DatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches datasets and displays them', async () => {
    callApiMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'abc123456',
            testCases: [],
            prompts: [],
            count: 0,
            recentEvalDate: '2024-01-01',
            recentEvalId: 'eval1',
          },
        ],
      }),
    } as Response);

    render(
      <MemoryRouter>
        <DatasetsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('abc123')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    callApiMock.mockRejectedValueOnce(new Error('network'));

    render(
      <MemoryRouter>
        <DatasetsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load datasets. Please try again.')).toBeInTheDocument();
    });
  });

  // Regression for https://github.com/promptfoo/promptfoo/issues/2248:
  // sorted rows beyond the first ten must open their own dataset.
  it.each([
    ['id-014', 'dataset 14', 1],
    ['id-004', 'dataset 4', 11],
    ['id-000', 'dataset 0', 15],
  ])('opens %s from its sorted row', async (id, prompt, rowNumber) => {
    const data = Array.from({ length: 15 }, (_, i) => ({
      id: `id-${String(i).padStart(3, '0')}`,
      recentEvalDate: new Date(2024, 0, i + 1).toISOString(),
      recentEvalId: `eval-${i}`,
      testCases: [{ vars: { prompt: `dataset ${i}` } }],
      prompts: [],
      count: 1,
    }));
    callApiMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DatasetsPage />
      </MemoryRouter>,
    );
    await screen.findByText('id-014');
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[rowNumber]).toHaveTextContent(id);
    await user.click(within(rows[rowNumber]).getByText(id));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(id)).toBeInTheDocument();
    expect(dialog.querySelector('pre')?.textContent).toBe(`- vars:\n    prompt: ${prompt}\n`);
  });
});
