import type { ReactNode } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import {
  mockBrowserProperty,
  mockIntersectionObserver,
  mockMatchMedia,
} from '@app/tests/browserMocks';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaGrid } from './MediaGrid';

import type { MediaItem } from '../types';

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

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
let intersectionCallback: IntersectionObserverCallback | null = null;

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

const getMediaCardActions = () =>
  within(screen.getByRole('list')).getAllByRole('button', { name: /^Image: Evaluation \d+/ });

const getMediaCardAction = (name: string | RegExp) =>
  within(screen.getByRole('list')).getByRole('button', { name });

const getCardContainer = (name: string | RegExp) => {
  const primaryAction = getMediaCardAction(name);
  expect(primaryAction.parentElement).not.toBeNull();
  return primaryAction.parentElement as HTMLElement;
};

describe('MediaGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockObserve.mockClear();
    mockDisconnect.mockClear();
    intersectionCallback = null;
    mockMatchMedia({ matches: (query) => query === '(hover: hover)' });
    mockIntersectionObserver({
      observe: mockObserve,
      disconnect: mockDisconnect,
      onCreate: (callback) => {
        intersectionCallback = callback;
      },
    });
    mockBrowserProperty(window, 'innerWidth', 1280);
  });

  describe('rendering', () => {
    it('renders media items in a grid', () => {
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

      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(getMediaCardActions()).toHaveLength(3);
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

      expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'Media library - 5 items');
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
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={onItemClick}
        />,
      );

      await user.click(getMediaCardAction('Image: Evaluation 2'));

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
      renderWithProviders(
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

      expect(getCardContainer('Image: Evaluation 2 (currently viewing)')).toHaveClass(
        'border-primary',
      );
    });
  });

  describe('keyboard navigation', () => {
    it('navigates right with ArrowRight', async () => {
      const user = userEvent.setup();
      const items = createMockItems(6);
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

      await user.tab();
      expect(getMediaCardActions()[0]).toHaveFocus();

      await user.keyboard('{ArrowRight}');

      expect(getMediaCardActions()[1]).toHaveFocus();
    });

    it('navigates left with ArrowLeft', async () => {
      const user = userEvent.setup();
      const items = createMockItems(6);
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

      await user.tab();
      await user.keyboard('{ArrowRight}');
      await user.keyboard('{ArrowRight}');
      expect(getMediaCardActions()[2]).toHaveFocus();

      await user.keyboard('{ArrowLeft}');

      expect(getMediaCardActions()[1]).toHaveFocus();
    });

    it('navigates to first item with Home key', async () => {
      const user = userEvent.setup();
      const items = createMockItems(10);
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

      await user.tab();
      await user.keyboard('{End}');
      expect(getMediaCardActions()[9]).toHaveFocus();

      await user.keyboard('{Home}');

      expect(getMediaCardActions()[0]).toHaveFocus();
    });

    it('navigates to last item with End key', async () => {
      const user = userEvent.setup();
      const items = createMockItems(10);
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

      await user.tab();

      await user.keyboard('{End}');

      expect(getMediaCardActions()[9]).toHaveFocus();
    });

    it('triggers onItemClick with Enter key (native button activation)', async () => {
      const user = userEvent.setup();
      const onItemClick = vi.fn();
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={onItemClick}
        />,
      );

      await user.tab();
      expect(getMediaCardActions()[0]).toHaveFocus();
      await user.keyboard('{Enter}');

      expect(onItemClick).toHaveBeenCalledWith(items[0]);
    });

    it('triggers onItemClick with Space key (native button activation)', async () => {
      const user = userEvent.setup();
      const onItemClick = vi.fn();
      const items = createMockItems(3);
      renderWithProviders(
        <MediaGrid
          items={items}
          isLoading={false}
          isLoadingMore={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onItemClick={onItemClick}
        />,
      );

      await user.tab();
      expect(getMediaCardActions()[0]).toHaveFocus();
      await user.keyboard(' ');

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

    it('renders "Load more" button when hasMore and not loading', () => {
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

      expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
    });

    it('does not render "Load more" button when hasMore is false', () => {
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

      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });

    it('calls onLoadMore when "Load more" button is clicked', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: 'Load more' }));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('hides "Load more" button while loading more', () => {
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

      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
      expect(screen.getByText('Loading more...')).toBeInTheDocument();
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

      const cards = getMediaCardActions();
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
