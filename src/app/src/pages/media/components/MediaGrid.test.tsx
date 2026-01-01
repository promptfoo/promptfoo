import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../types';
import { MediaGrid } from './MediaGrid';

// Mock the API utilities
vi.mock('@app/utils/api', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
}));

// Mock the media utilities
vi.mock('@app/utils/media', () => ({
  downloadMediaItem: vi.fn(),
  formatBytes: (bytes: number) => `${bytes} B`,
  getKindIcon: () => () => <svg data-testid="kind-icon" />,
  getKindLabel: (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1),
  hashToNumber: () => 0,
  MEDIA_INFINITE_SCROLL_MARGIN: 100,
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === '(hover: hover)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
let intersectionCallback: IntersectionObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
  observe = mockObserve;
  unobserve = vi.fn();
  disconnect = mockDisconnect;
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock window dimensions for getItemsPerRow
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  value: 1280, // xl breakpoint
});

// Wrapper component with providers
const Wrapper = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderWithProviders = (ui: ReactNode) => render(ui, { wrapper: Wrapper });

const createMockMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  hash: `hash-${Math.random().toString(36).substring(7)}`,
  mimeType: 'image/png',
  sizeBytes: 1024,
  kind: 'image',
  createdAt: '2024-01-01T00:00:00Z',
  url: '/blobs/test',
  context: {
    evalId: 'eval-123',
    evalDescription: 'Test Evaluation',
    ...overrides.context,
  },
  ...overrides,
});

const createMockItems = (count: number): MediaItem[] =>
  Array.from({ length: count }, (_, i) =>
    createMockMediaItem({
      hash: `hash-${i}`,
      context: {
        evalId: `eval-${i}`,
        evalDescription: `Evaluation ${i + 1}`,
      },
    }),
  );

describe('MediaGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockObserve.mockClear();
    mockDisconnect.mockClear();
    intersectionCallback = null;
  });

  describe('rendering', () => {
    it('renders media items in a grid', () => {
      const items = createMockItems(3);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      expect(screen.getByRole('list')).toBeInTheDocument();
      // Each MediaCard is a div with role="button" - use div selector to exclude nested button elements
      const cards = container.querySelectorAll('div[role="button"]');
      expect(cards).toHaveLength(3);
    });

    it('renders with correct aria-label showing item count', () => {
      const items = createMockItems(5);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      expect(screen.getByRole('list')).toHaveAttribute(
        'aria-label',
        'Media library - 5 items',
      );
    });

    it('renders skeletons when loading', () => {
      renderWithProviders(
        <MediaGrid
          items={[]}
          isLoading={true}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      // Should render skeleton grid instead of list
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('renders loading more indicator when isLoadingMore', () => {
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={true}
          hasMore={true}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      expect(screen.getByText('Loading more...')).toBeInTheDocument();
    });

    it('does not render loading indicator when not loading more', () => {
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      expect(screen.queryByText('Loading more...')).not.toBeInTheDocument();
    });
  });

  describe('item click handling', () => {
    it('calls onItemClick when an item is clicked', async () => {
      const user = userEvent.setup();
      const onItemClick = vi.fn();
      const items = createMockItems(3);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={onItemClick}
        />,
      );

      // Get the MediaCard div elements (role="button" on the card container)
      const cards = container.querySelectorAll('div[role="button"]');
      await user.click(cards[1] as HTMLElement);

      expect(onItemClick).toHaveBeenCalledWith(items[1]);
    });
  });

  describe('selection mode', () => {
    it('passes selection props to MediaCard', () => {
      const items = createMockItems(3);
      const selectedHashes = new Set(['hash-1']);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
          isSelectionMode={true}
          selectedHashes={selectedHashes}
          onToggleSelection={vi.fn()}
        />,
      );

      // Check that selection checkboxes are rendered
      expect(screen.getByLabelText('Deselect')).toBeInTheDocument(); // hash-1 is selected
      expect(screen.getAllByLabelText('Select')).toHaveLength(2); // other 2 are not
    });

    it('calls onToggleSelection when checkbox is clicked', async () => {
      const user = userEvent.setup();
      const onToggleSelection = vi.fn();
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
          isSelectionMode={true}
          selectedHashes={new Set()}
          onToggleSelection={onToggleSelection}
        />,
      );

      const selectButtons = screen.getAllByLabelText('Select');
      await user.click(selectButtons[0]);

      expect(onToggleSelection).toHaveBeenCalledWith('hash-0');
    });
  });

  describe('viewing state', () => {
    it('passes viewingHash to MediaCard', () => {
      const items = createMockItems(3);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
          viewingHash="hash-1"
        />,
      );

      // The viewing card should have special styling
      const cards = container.querySelectorAll('[role="button"]');
      const viewingCard = cards[1];
      expect(viewingCard).toHaveClass('border-primary');
    });
  });

  describe('keyboard navigation', () => {
    it('navigates right with ArrowRight', () => {
      const items = createMockItems(6);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      // Get the MediaCard elements and focus first one
      const cards = container.querySelectorAll('div[role="button"]');

      // Use act() to ensure state updates are flushed
      act(() => {
        fireEvent.focus(cards[0] as HTMLElement);
      });

      act(() => {
        fireEvent.keyDown(screen.getByRole('list'), { key: 'ArrowRight' });
      });

      // Re-query cards after state update - second card should now be focusable
      const updatedCards = container.querySelectorAll('div[role="button"]');
      expect(updatedCards[1]).toHaveAttribute('tabIndex', '0');
    });

    it('navigates left with ArrowLeft', () => {
      const items = createMockItems(6);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      const cards = container.querySelectorAll('div[role="button"]');

      // Focus second card first
      act(() => {
        fireEvent.focus(cards[1] as HTMLElement);
      });

      act(() => {
        fireEvent.keyDown(screen.getByRole('list'), { key: 'ArrowRight' });
      });

      // Now go left
      act(() => {
        fireEvent.keyDown(screen.getByRole('list'), { key: 'ArrowLeft' });
      });

      // Re-query after state update
      const updatedCards = container.querySelectorAll('div[role="button"]');
      expect(updatedCards[1]).toHaveAttribute('tabIndex', '0');
    });

    it('navigates to first item with Home key', () => {
      const items = createMockItems(10);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      const cards = container.querySelectorAll('div[role="button"]');

      // Move to middle first
      act(() => {
        fireEvent.focus(cards[5] as HTMLElement);
      });

      // Press Home
      act(() => {
        fireEvent.keyDown(screen.getByRole('list'), { key: 'Home' });
      });

      // Re-query after state update
      const updatedCards = container.querySelectorAll('div[role="button"]');
      expect(updatedCards[0]).toHaveAttribute('tabIndex', '0');
    });

    it('navigates to last item with End key', () => {
      const items = createMockItems(10);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      const cards = container.querySelectorAll('div[role="button"]');

      act(() => {
        fireEvent.focus(cards[0] as HTMLElement);
      });

      act(() => {
        fireEvent.keyDown(screen.getByRole('list'), { key: 'End' });
      });

      // Re-query after state update
      const updatedCards = container.querySelectorAll('div[role="button"]');
      expect(updatedCards[9]).toHaveAttribute('tabIndex', '0');
    });

    it('triggers onItemClick with Enter key', () => {
      const onItemClick = vi.fn();
      const items = createMockItems(3);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={onItemClick}
        />,
      );

      const cards = container.querySelectorAll('div[role="button"]');

      // Focus first card - this sets focusedIndex to 0
      act(() => {
        fireEvent.focus(cards[0] as HTMLElement);
      });

      // Press Enter - should trigger onItemClick with items[0] (the focused item)
      act(() => {
        fireEvent.keyDown(screen.getByRole('list'), { key: 'Enter' });
      });

      expect(onItemClick).toHaveBeenCalledWith(items[0]);
    });

    it('triggers onItemClick with Space key', () => {
      const onItemClick = vi.fn();
      const items = createMockItems(3);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={onItemClick}
        />,
      );

      const cards = container.querySelectorAll('div[role="button"]');

      // Focus first card - this sets focusedIndex to 0
      act(() => {
        fireEvent.focus(cards[0] as HTMLElement);
      });

      // Press Space - should trigger onItemClick with items[0] (the focused item)
      act(() => {
        fireEvent.keyDown(screen.getByRole('list'), { key: ' ' });
      });

      expect(onItemClick).toHaveBeenCalledWith(items[0]);
    });
  });

  describe('infinite scroll', () => {
    it('sets up IntersectionObserver', () => {
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      expect(mockObserve).toHaveBeenCalled();
    });

    it('triggers onLoadMore when scroll trigger is intersecting', () => {
      const onLoadMore = vi.fn();
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={true}
          onLoadMore={onLoadMore}
          onItemClick={vi.fn()}
        />,
      );

      // Simulate intersection
      if (intersectionCallback) {
        intersectionCallback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }

      expect(onLoadMore).toHaveBeenCalled();
    });

    it('does not trigger onLoadMore when isLoadingMore', () => {
      const onLoadMore = vi.fn();
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={true}
          hasMore={true}
          onLoadMore={onLoadMore}
          onItemClick={vi.fn()}
        />,
      );

      // Simulate intersection
      if (intersectionCallback) {
        intersectionCallback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }

      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('does not trigger onLoadMore when hasMore is false', () => {
      const onLoadMore = vi.fn();
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={onLoadMore}
          onItemClick={vi.fn()}
        />,
      );

      // Simulate intersection
      if (intersectionCallback) {
        intersectionCallback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }

      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('disconnects observer on unmount', () => {
      const items = createMockItems(3);
      const { unmount } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={true}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe('focus management', () => {
    it('first item has tabIndex 0 when no item is focused', () => {
      const items = createMockItems(3);
      const { container } = renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      const cards = container.querySelectorAll('div[role="button"]');
      expect(cards[0]).toHaveAttribute('tabIndex', '0');
      expect(cards[1]).toHaveAttribute('tabIndex', '-1');
      expect(cards[2]).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('grid layout', () => {
    it('applies correct grid classes', () => {
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={vi.fn()}
        />,
      );

      const grid = screen.getByRole('list');
      expect(grid).toHaveClass('grid', 'gap-4');
      expect(grid).toHaveClass('grid-cols-2'); // base
      expect(grid).toHaveClass('sm:grid-cols-3');
      expect(grid).toHaveClass('md:grid-cols-4');
      expect(grid).toHaveClass('lg:grid-cols-5');
      expect(grid).toHaveClass('xl:grid-cols-6');
    });
  });
});
