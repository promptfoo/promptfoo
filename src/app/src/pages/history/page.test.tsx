import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it("should set the page title to 'History' and description to 'Evaluation history' when rendered", () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    expect(document.title).toBe('History | promptfoo');

    const descriptionMetaTag = document.querySelector('meta[name="description"]');
    expect(descriptionMetaTag).not.toBeNull();
    expect(descriptionMetaTag?.getAttribute('content')).toBe('Evaluation history');

    const ogTitleTag = document.querySelector('meta[property="og:title"]');
    expect(ogTitleTag?.getAttribute('content')).toBe('History | promptfoo');

    const ogDescriptionTag = document.querySelector('meta[property="og:description"]');
    expect(ogDescriptionTag?.getAttribute('content')).toBe('Evaluation history');
  });

  it('should render its children within the ErrorBoundary without triggering an error state', () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('history-component-mock')).toBeInTheDocument();
  });

  it('should restore the original title and description when unmounted', () => {
    const { unmount } = render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    unmount();

    expect(document.title).toBe(originalTitle);
    const descriptionMetaTag = document.querySelector('meta[name="description"]');
    expect(descriptionMetaTag?.getAttribute('content')).toBe('Default test description');

    const ogTitleTag = document.querySelector('meta[property="og:title"]');
    expect(ogTitleTag?.getAttribute('content')).toBe('Default OG Title');

    const ogDescriptionTag = document.querySelector('meta[property="og:description"]');
    expect(ogDescriptionTag?.getAttribute('content')).toBe('Default OG Description');

    const ogImageTag = document.querySelector('meta[property="og:image"]');
    expect(ogImageTag?.getAttribute('content')).toBe('Default OG Image');
  });
});
