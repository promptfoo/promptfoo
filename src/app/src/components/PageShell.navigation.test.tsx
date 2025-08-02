import { useResultsViewSettingsStore } from '@app/pages/eval/components/store';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageShell from './PageShell';

// Mock components
vi.mock('@app/components/Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));

vi.mock('@app/components/PostHogProvider', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./PostHogPageViewTracker', () => ({
  PostHogPageViewTracker: () => <div data-testid="posthog-tracker" />,
}));

// Mock the store
const mockUseResultsViewSettingsStore = vi.fn();
vi.mock('@app/pages/eval/components/store', () => ({
  useResultsViewSettingsStore: (...args: any[]) => mockUseResultsViewSettingsStore(...args),
}));

const renderPageShell = (initialPath = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/*" element={<PageShell />}>
          <Route path="eval/:evalId" element={<div>Eval Page</div>} />
          <Route path="evals" element={<div>Evals List</div>} />
          <Route path="*" element={<div>Other Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
};

describe('PageShell - Navigation Visibility', () => {
  beforeEach(() => {
    // Default mock implementation - return false for topAreaCollapsed
    mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
      if (typeof selector === 'function') {
        // Zustand selector pattern
        return selector({ topAreaCollapsed: false });
      }
      // Full state
      return { topAreaCollapsed: false };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Navigation visibility based on topAreaCollapsed', () => {
    it('should show navigation when topAreaCollapsed is false', async () => {
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed: false });
        }
        return { topAreaCollapsed: false };
      });
      
      renderPageShell('/eval/123');

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });
    });

    it('should hide navigation on eval pages when topAreaCollapsed is true', async () => {
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed: true });
        }
        return { topAreaCollapsed: true };
      });
      
      renderPageShell('/eval/123');

      await waitFor(() => {
        expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
      });
    });

    it('should always show navigation on non-eval pages even when topAreaCollapsed is true', async () => {
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed: true });
        }
        return { topAreaCollapsed: true };
      });
      
      renderPageShell('/evals');

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });
    });
  });

  describe('Path-based navigation visibility', () => {
    it.each([
      { path: '/eval/123', shouldHide: true, description: 'eval detail page' },
      { path: '/eval/456/table', shouldHide: true, description: 'eval table view' },
      { path: '/evals', shouldHide: false, description: 'evals list page' },
      { path: '/setup', shouldHide: false, description: 'setup page' },
      { path: '/prompts', shouldHide: false, description: 'prompts page' },
      { path: '/', shouldHide: false, description: 'home page' },
    ])(
      'should ${shouldHide ? "hide" : "show"} navigation on $description when collapsed',
      async ({ path, shouldHide }) => {
        mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
          if (typeof selector === 'function') {
            return selector({ topAreaCollapsed: true });
          }
          return { topAreaCollapsed: true };
        });
        
        renderPageShell(path);

        await waitFor(() => {
          if (shouldHide) {
            expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
          } else {
            expect(screen.getByTestId('navigation')).toBeInTheDocument();
          }
        });
      }
    );
  });

  describe('Store state changes', () => {
    it('should react to store state changes', async () => {
      let topAreaCollapsed = false;
      mockUseResultsViewSettingsStore.mockImplementation((selector?: any) => {
        if (typeof selector === 'function') {
          return selector({ topAreaCollapsed });
        }
        return { topAreaCollapsed };
      });
      
      const { rerender } = renderPageShell('/eval/123');

      // Initially visible
      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument();
      });

      // Update store state and rerender
      topAreaCollapsed = true;
      rerender(
        <MemoryRouter initialEntries={['/eval/123']}>
          <Routes>
            <Route path="/*" element={<PageShell />}>
              <Route path="eval/:evalId" element={<div>Eval Page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      // Should be hidden after state change
      await waitFor(() => {
        expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
      });
    });
  });
});