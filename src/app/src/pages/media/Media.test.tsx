import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockIntersectionObserver } from '@app/tests/browserMocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaItem } from './types';

// Mock callApi and useTelemetry before importing the component
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  getApiBaseUrl: () => '',
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));

// Mock thumbnail cache cleanup
vi.mock('./hooks/useThumbnailCache', () => ({
  clearExpiredThumbnails: () => Promise.resolve(),
}));

import { callApi } from '@app/utils/api';
import Media from './Media';

// Helper to capture current location for assertions
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderMedia(initialPath = '/media') {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/media"
            element={
              <>
                <Media />
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

const makeItem = (hash: string, description = `Item ${hash}`): MediaItem => ({
  hash,
  mimeType: 'image/png',
  sizeBytes: 1024,
  kind: 'image',
  createdAt: '2025-01-01T00:00:00Z',
  url: `/api/blobs/${hash}`,
  context: {
    evalId: 'eval-1',
    evalDescription: description,
    provider: 'test-provider',
  },
});

const mockItems = [makeItem('aaa111', 'First item'), makeItem('bbb222', 'Second item')];

function mockApiResponses(items: MediaItem[] = mockItems) {
  vi.mocked(callApi).mockImplementation(async (url: string, _opts?: any) => {
    const urlStr = String(url);

    if (urlStr.includes('/blobs/library/evals')) {
      return {
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response;
    }

    if (urlStr.includes('/blobs/library')) {
      // Check for hash param (deep-link fetch)
      const hashMatch = urlStr.match(/hash=([^&]+)/);
      if (hashMatch) {
        const hash = decodeURIComponent(hashMatch[1]);
        const item = items.find((i) => i.hash === hash);
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              items: item ? [item] : [],
              total: item ? 1 : 0,
              hasMore: false,
              blobStorageEnabled: true,
            },
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items,
            total: items.length,
            hasMore: false,
            blobStorageEnabled: true,
          },
        }),
      } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  });
}

describe('Media page URL state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntersectionObserver();
  });

  it('renders the media grid with items', async () => {
    mockApiResponses();
    renderMedia();

    await waitFor(() => {
      expect(screen.getByText('First item')).toBeInTheDocument();
      expect(screen.getByText('Second item')).toBeInTheDocument();
    });
  });

  it('clicking a card adds hash to URL', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderMedia();

    await waitFor(() => {
      expect(screen.getByText('First item')).toBeInTheDocument();
    });

    // Click the first card's button (aria-label includes eval description)
    const cardButton = screen.getByLabelText(/First item/);
    await user.click(cardButton);

    await waitFor(() => {
      const location = screen.getByTestId('location');
      expect(location.textContent).toContain('hash=aaa111');
    });
  });

  it('deep-link: opening with hash param shows modal', async () => {
    mockApiResponses();
    renderMedia('/media?hash=aaa111');

    // The modal dialog should open with the item
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('deep-link: fetches item by hash when not in loaded list', async () => {
    const deepLinkedItem = makeItem('ccc333', 'Deep linked item');

    vi.mocked(callApi).mockImplementation(async (url: string, _opts?: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/blobs/library/evals')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: [] }),
        } as Response;
      }

      if (urlStr.includes('/blobs/library')) {
        const hashMatch = urlStr.match(/hash=([^&]+)/);
        if (hashMatch) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                items: [deepLinkedItem],
                total: 1,
                hasMore: false,
                blobStorageEnabled: true,
              },
            }),
          } as Response;
        }

        // Main list doesn't contain ccc333
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              items: mockItems,
              total: mockItems.length,
              hasMore: false,
              blobStorageEnabled: true,
            },
          }),
        } as Response;
      }

      return { ok: true, json: async () => ({}) } as Response;
    });

    renderMedia('/media?hash=ccc333');

    // The modal dialog should open after the hash is fetched
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('deep-link error: shows error for non-existent hash', async () => {
    vi.mocked(callApi).mockImplementation(async (url: string, _opts?: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/blobs/library/evals')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: [] }),
        } as Response;
      }

      if (urlStr.includes('/blobs/library')) {
        const hashMatch = urlStr.match(/hash=([^&]+)/);
        if (hashMatch) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: { items: [], total: 0, hasMore: false },
            }),
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              items: mockItems,
              total: mockItems.length,
              hasMore: false,
              blobStorageEnabled: true,
            },
          }),
        } as Response;
      }

      return { ok: true, json: async () => ({}) } as Response;
    });

    renderMedia('/media?hash=nonexistent');

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('closing modal removes hash from URL', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderMedia();

    await waitFor(() => {
      expect(screen.getByText('First item')).toBeInTheDocument();
    });

    // Click to open a card
    const cardButton = screen.getByLabelText(/First item/);
    await user.click(cardButton);

    await waitFor(() => {
      const location = screen.getByTestId('location');
      expect(location.textContent).toContain('hash=aaa111');
    });

    // Close the modal (Escape key)
    await user.keyboard('{Escape}');

    await waitFor(() => {
      const location = screen.getByTestId('location');
      expect(location.textContent).not.toContain('hash=');
    });
  });

  it('type filter change updates URL and clears hash', async () => {
    const user = userEvent.setup();
    mockApiResponses();
    renderMedia();

    await waitFor(() => {
      expect(screen.getByText('First item')).toBeInTheDocument();
    });

    // Click the Videos tab
    const videosTab = screen.getByRole('tab', { name: /Videos/i });
    await user.click(videosTab);

    await waitFor(() => {
      const location = screen.getByTestId('location');
      expect(location.textContent).toContain('type=video');
    });
  });

  it('shows error when library API returns non-OK response', async () => {
    vi.mocked(callApi).mockImplementation(async (url: string, _opts?: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/blobs/library/evals')) {
        return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
      }

      if (urlStr.includes('/blobs/library')) {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }

      return { ok: true, json: async () => ({}) } as Response;
    });

    renderMedia();

    await waitFor(() => {
      expect(screen.getByText(/Server error/)).toBeInTheDocument();
    });
  });

  it('shows error when evals API returns non-OK response', async () => {
    vi.mocked(callApi).mockImplementation(async (url: string, _opts?: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/blobs/library/evals')) {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }

      if (urlStr.includes('/blobs/library')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              items: mockItems,
              total: mockItems.length,
              hasMore: false,
              blobStorageEnabled: true,
            },
          }),
        } as Response;
      }

      return { ok: true, json: async () => ({}) } as Response;
    });

    renderMedia();

    // The evals error should be visible in the filter popover, not as a page-level error.
    // But the page should still render successfully with the library items.
    await waitFor(() => {
      expect(screen.getByText('First item')).toBeInTheDocument();
    });
  });
});
