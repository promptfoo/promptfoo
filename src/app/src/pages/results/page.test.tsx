import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../history/HistoryDataGrid', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="history-grid">history-count:{data.length}</div>
  ),
}));

vi.mock('./components/RedTeamsDataGrid', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="redteams-grid">redteam-count:{data.length}</div>
  ),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('@app/stores/userStore', () => ({
  useUserStore: vi.fn(),
}));

import ResultsPage from './page';
import { callApi } from '@app/utils/api';
import { useUserStore } from '@app/stores/userStore';

const mockFetchEmail = vi.fn();

const TestLocation = () => {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
};

describe('ResultsPage', () => {
  let descriptionMetaTag: HTMLMetaElement;
  const originalTitle = document.title;

  beforeEach(() => {
    descriptionMetaTag = document.createElement('meta');
    descriptionMetaTag.name = 'description';
    descriptionMetaTag.content = 'Initial description';
    document.head.appendChild(descriptionMetaTag);
    document.title = 'Initial Title';
    mockFetchEmail.mockReset();

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [] }),
    } as any);
    vi.mocked(useUserStore).mockReturnValue({
      email: 'user@example.com',
      isLoading: false,
      fetchEmail: mockFetchEmail,
    });
  });

  afterEach(() => {
    document.head.removeChild(descriptionMetaTag);
    document.title = originalTitle;
    vi.clearAllMocks();
  });

  it("sets the page title to 'Results | promptfoo' and description to 'Browse evaluation history and red team reports'", async () => {
    render(
      <MemoryRouter>
        <ResultsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/history', expect.any(Object));
    });

    expect(document.title).toBe('Results | promptfoo');
    const updatedDescriptionMeta = document.querySelector('meta[name="description"]');
    expect(updatedDescriptionMeta?.getAttribute('content')).toBe(
      'Browse evaluation history and red team reports',
    );
    expect(mockFetchEmail).toHaveBeenCalled();
  });

  it('updates the URL query param when switching to the Red Teams tab', async () => {
    render(
      <MemoryRouter initialEntries={['/results']}>
        <ResultsPage />
        <TestLocation />
      </MemoryRouter>,
    );

    const redTeamsTab = await screen.findByRole('tab', { name: /Red Teams/i });
    fireEvent.click(redTeamsTab);

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toContain('tab=redteams');
    });
  });
});
