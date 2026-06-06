import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatasetsPage from './page';

const callApiJsonMock = vi.fn();
vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApiJson: (...args: any[]) => callApiJsonMock(...args),
}));

describe('DatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches datasets and displays them', async () => {
    callApiJsonMock.mockResolvedValueOnce({
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
    });

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
    callApiJsonMock.mockRejectedValueOnce(new Error('network'));

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
