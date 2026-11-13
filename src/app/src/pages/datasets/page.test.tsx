import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Datasets from './Datasets';
import DatasetsPage from './page';

const callApiMock = vi.fn();
vi.mock('@app/utils/api', () => ({
  callApi: (...args: any[]) => callApiMock(...args),
}));

const datasets = Array.from({ length: 15 }, (_, i) => ({
  id: `id-${String(i).padStart(3, '0')}`,
  recentEvalDate: new Date(2024, 0, i + 1).toISOString(),
  recentEvalId: `eval-${i}`,
  testCases: [{ vars: { prompt: `dataset ${i}` } }],
  prompts: [],
  count: 1,
}));

describe('DatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches datasets and opens the first one matching the URL prefix', async () => {
    callApiMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: datasets }) });

    render(
      <MemoryRouter initialEntries={['/datasets?id=id-01']}>
        <DatasetsPage />
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('id-010')).toBeInTheDocument();
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
    callApiMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: datasets }) });
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

  it('keeps the clicked index while its row is absent and reopens the row at that index', async () => {
    const user = userEvent.setup();
    const view = (data: typeof datasets) => <Datasets data={data} isLoading={false} error={null} />;
    const { rerender } = render(view([datasets[0], datasets[14]]), { wrapper: MemoryRouter });
    await user.click(screen.getByText('id-014'));
    expect(within(screen.getByRole('dialog')).getByText('id-014')).toBeInTheDocument();

    rerender(view([datasets[0]]));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(view([datasets[0], datasets[1]]));
    expect(within(screen.getByRole('dialog')).getByText('id-001')).toBeInTheDocument();
  });
});
