import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

    expect(screen.getByRole('button', { name: 'View dataset abc123456' })).toBeInTheDocument();
  });

  it('opens dataset details from the explicit row action', async () => {
    const user = userEvent.setup();
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

    await user.click(await screen.findByRole('button', { name: 'View dataset abc123456' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
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
});
