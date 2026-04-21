import React from 'react';

import { EvalHistoryProvider } from '@app/contexts/EvalHistoryContext';
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

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <EvalHistoryProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </EvalHistoryProvider>,
  );
};

vi.mock('../../components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./History', () => ({
  default: () => <div data-testid="history-component-mock" />,
}));

describe('HistoryPage', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = 'Default test description';
    document.head.appendChild(meta);

    const ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.content = 'Default OG Title';
    document.head.appendChild(ogTitle);

    const ogDescription = document.createElement('meta');
    ogDescription.setAttribute('property', 'og:description');
    ogDescription.content = 'Default OG Description';
    document.head.appendChild(ogDescription);

    const ogImage = document.createElement('meta');
    ogImage.setAttribute('property', 'og:image');
    ogImage.content = 'Default OG Image';
    document.head.appendChild(ogImage);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.head.innerHTML = '';
    document.title = originalTitle;
  });

  it("should set the page title to 'History' and description to 'Evaluation history' when rendered", async () => {
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(document.title).toBe('History | promptfoo');
    });

    const descriptionMetaTag = document.querySelector('meta[name="description"]');
    expect(descriptionMetaTag).not.toBeNull();
    expect(descriptionMetaTag?.getAttribute('content')).toBe('Evaluation history');
  });

  it('should render its children within the ErrorBoundary without triggering an error state', async () => {
    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId('history-component-mock')).toBeInTheDocument();
    });
  });
});
