import React from 'react';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from './page';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ data: [] }),
    }),
  ),
}));

vi.mock('../../components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./History', () => ({
  default: () => <div data-testid="history-component-mock" />,
}));

describe('HistoryPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should set the page title to 'History' and description to 'Evaluation history' when rendered", async () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.title).toBe('History | promptfoo');
    });

    const descriptionMetaTag = document.querySelector('meta[name="description"]');
    expect(descriptionMetaTag).not.toBeNull();
    expect(descriptionMetaTag?.getAttribute('content')).toBe('Evaluation history');
  });

  it('should render its children within the ErrorBoundary without triggering an error state', async () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('history-component-mock')).toBeInTheDocument();
    });
  });
});
