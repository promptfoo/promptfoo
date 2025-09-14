import { render, screen, waitFor } from '@testing-library/react';
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
