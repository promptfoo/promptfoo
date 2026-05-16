import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageShell from './PageShell';

vi.mock('@app/components/Navigation', () => {
  const MockNavigation = () => <div data-testid="navigation-mock" />;

  return {
    default: MockNavigation,
  };
});

vi.mock('@app/components/PostHogProvider', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./PostHogPageViewTracker', () => ({
  PostHogPageViewTracker: () => <div data-testid="posthog-tracker-mock" />,
}));

vi.mock('@app/components/UpdateBanner', () => {
  const MockUpdateBanner = () => {
    return <div data-testid="update-banner-mock">UpdateBanner</div>;
  };
  return {
    default: MockUpdateBanner,
  };
});

const renderPageShell = (initialPath = '/', children: React.ReactNode = null) => {
  return render(
    <TooltipProvider delayDuration={0}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<PageShell />}>
            <Route path="*" element={children} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
};

describe('PageShell', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render navigation component', async () => {
    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('navigation-mock')).toBeInTheDocument();
    });
  });

  it('should render update banner', async () => {
    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('update-banner-mock')).toBeInTheDocument();
    });
  });

  it('should render PostHog tracker', async () => {
    renderPageShell();
    await waitFor(() => {
      expect(screen.getByTestId('posthog-tracker-mock')).toBeInTheDocument();
    });
  });
});
