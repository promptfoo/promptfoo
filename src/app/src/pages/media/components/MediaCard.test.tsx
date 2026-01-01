import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../types';
import { MediaCard } from './MediaCard';

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
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Wrapper component with providers
const Wrapper = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderWithProviders = (ui: ReactNode) => render(ui, { wrapper: Wrapper });

const createMockMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  hash: 'abc123',
  mimeType: 'image/png',
  sizeBytes: 1024,
  kind: 'image',
  createdAt: '2024-01-01T00:00:00Z',
  url: '/blobs/abc123',
  context: {
    evalId: 'eval-123',
    evalDescription: 'Test Evaluation',
    testIdx: 0,
    promptIdx: 0,
    provider: 'openai/dall-e-3',
    ...overrides.context,
  },
  ...overrides,
});

describe('MediaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the media card', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      // The main card has role="button" and is the container
      const card = container.querySelector('[role="button"]');
      expect(card).toBeInTheDocument();
    });

    it('renders image preview for image kind', () => {
      const item = createMockMediaItem({ kind: 'image' });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'http://localhost:3000/blobs/abc123');
      expect(img).toHaveAttribute('alt', 'Test Evaluation');
    });

    it('renders the provider name', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-123',
          provider: 'openai/dall-e-3',
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('openai/dall-e-3')).toBeInTheDocument();
    });

    it('renders the eval description', () => {
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('Test Evaluation')).toBeInTheDocument();
    });

    it('renders test and prompt indices', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-123',
          testIdx: 2,
          promptIdx: 1,
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('Test #3, Prompt #2')).toBeInTheDocument();
    });

    it('renders only test index when promptIdx is undefined', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-123',
          testIdx: 0,
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('Test #1')).toBeInTheDocument();
    });

    it('renders fallback eval ID when description is missing', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-12345678-abcd',
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('Eval eval-123')).toBeInTheDocument();
    });

    it('renders mime type when provider is missing', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-123',
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('image/png')).toBeInTheDocument();
    });
  });

  describe('pass/fail indicators', () => {
    it('renders pass indicator when pass is true', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-123',
          pass: true,
          score: 0.95,
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('renders fail indicator when pass is false', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-123',
          pass: false,
          score: 0.25,
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('does not render pass/fail indicator when pass is undefined', () => {
      const item = createMockMediaItem({
        context: {
          evalId: 'eval-123',
        },
      });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      // Should not have percentage text
      expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    });
  });

  describe('click handling', () => {
    it('calls onClick when card is clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={onClick} />);

      const card = container.querySelector('div[role="button"]');
      await user.click(card!);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when Enter key is pressed', () => {
      const onClick = vi.fn();
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={onClick} />);

      const card = container.querySelector('div[role="button"]');
      fireEvent.keyDown(card!, { key: 'Enter' });

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when Space key is pressed', () => {
      const onClick = vi.fn();
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={onClick} />);

      const card = container.querySelector('div[role="button"]');
      fireEvent.keyDown(card!, { key: ' ' });

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('selection mode', () => {
    it('renders selection checkbox when in selection mode', () => {
      const item = createMockMediaItem();
      renderWithProviders(
        <MediaCard
          item={item}
          onClick={vi.fn()}
          isSelectionMode={true}
          isSelected={false}
          onToggleSelection={vi.fn()}
        />,
      );

      expect(screen.getByLabelText('Select')).toBeInTheDocument();
    });

    it('shows selected state when isSelected is true', () => {
      const item = createMockMediaItem();
      renderWithProviders(
        <MediaCard
          item={item}
          onClick={vi.fn()}
          isSelectionMode={true}
          isSelected={true}
          onToggleSelection={vi.fn()}
        />,
      );

      expect(screen.getByLabelText('Deselect')).toBeInTheDocument();
    });

    it('calls onToggleSelection when checkbox is clicked', async () => {
      const user = userEvent.setup();
      const onToggleSelection = vi.fn();
      const item = createMockMediaItem();
      renderWithProviders(
        <MediaCard
          item={item}
          onClick={vi.fn()}
          isSelectionMode={true}
          isSelected={false}
          onToggleSelection={onToggleSelection}
        />,
      );

      await user.click(screen.getByLabelText('Select'));

      expect(onToggleSelection).toHaveBeenCalledWith('abc123');
    });

    it('calls onToggleSelection instead of onClick when clicking card in selection mode', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const onToggleSelection = vi.fn();
      const item = createMockMediaItem();
      const { container } = renderWithProviders(
        <MediaCard
          item={item}
          onClick={onClick}
          isSelectionMode={true}
          isSelected={false}
          onToggleSelection={onToggleSelection}
        />,
      );

      const card = container.querySelector('div[role="button"]');
      await user.click(card!);

      expect(onToggleSelection).toHaveBeenCalledWith('abc123');
      expect(onClick).not.toHaveBeenCalled();
    });

    it('does not show download button in selection mode', () => {
      const item = createMockMediaItem();
      renderWithProviders(
        <MediaCard
          item={item}
          onClick={vi.fn()}
          isSelectionMode={true}
          isSelected={false}
          onToggleSelection={vi.fn()}
        />,
      );

      expect(screen.queryByLabelText('Download')).not.toBeInTheDocument();
    });
  });

  describe('download button', () => {
    it('renders download button when not in selection mode', () => {
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByLabelText('Download')).toBeInTheDocument();
    });

    it('calls downloadMediaItem when download button is clicked', async () => {
      const user = userEvent.setup();
      const { downloadMediaItem } = await import('@app/utils/media');
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      await user.click(screen.getByLabelText('Download'));

      expect(downloadMediaItem).toHaveBeenCalledWith(
        'http://localhost:3000/blobs/abc123',
        'abc123',
        'image/png',
      );
    });

    it('does not trigger onClick when download button is clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={onClick} />);

      await user.click(screen.getByLabelText('Download'));

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('visual states', () => {
    it('applies viewing styles when isViewing is true', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(
        <MediaCard item={item} onClick={vi.fn()} isViewing={true} />,
      );

      const card = container.querySelector('[role="button"]');
      expect(card).toHaveClass('border-primary', 'ring-2');
    });

    it('applies selected styles when isSelected is true', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(
        <MediaCard
          item={item}
          onClick={vi.fn()}
          isSelectionMode={true}
          isSelected={true}
          onToggleSelection={vi.fn()}
        />,
      );

      const card = container.querySelector('[role="button"]');
      expect(card).toHaveClass('border-primary');
    });

    it('applies focused styles when isFocused is true', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(
        <MediaCard item={item} onClick={vi.fn()} isFocused={true} />,
      );

      const card = container.querySelector('[role="button"]');
      expect(card).toHaveClass('ring-2');
    });
  });

  describe('accessibility', () => {
    it('has correct aria-label for basic card', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      const card = container.querySelector('div[role="button"]');
      expect(card).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Image'),
      );
    });

    it('includes viewing state in aria-label', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={vi.fn()} isViewing={true} />);

      const card = container.querySelector('div[role="button"]');
      expect(card).toHaveAttribute(
        'aria-label',
        expect.stringContaining('currently viewing'),
      );
    });

    it('includes selection state in aria-label', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(
        <MediaCard
          item={item}
          onClick={vi.fn()}
          isSelectionMode={true}
          isSelected={true}
          onToggleSelection={vi.fn()}
        />,
      );

      const card = container.querySelector('div[role="button"]');
      expect(card).toHaveAttribute(
        'aria-label',
        expect.stringContaining('selected'),
      );
    });

    it('calls onFocus callback', () => {
      const onFocus = vi.fn();
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={vi.fn()} onFocus={onFocus} />);

      // Get the main card div (not the nested download button)
      const card = container.querySelector('div[role="button"]');
      fireEvent.focus(card!);

      expect(onFocus).toHaveBeenCalledTimes(1);
    });

    it('supports custom tabIndex', () => {
      const item = createMockMediaItem();
      const { container } = renderWithProviders(<MediaCard item={item} onClick={vi.fn()} tabIndex={-1} />);

      // Get the main card div (not the nested download button)
      const card = container.querySelector('div[role="button"]');
      expect(card).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('media types', () => {
    it('renders video badge for video kind', () => {
      const item = createMockMediaItem({ kind: 'video', mimeType: 'video/mp4' });
      const { container } = renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      // Video badge should be visible - look for svg icons
      const svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBeGreaterThan(0);
    });

    it('renders audio badge for audio kind', () => {
      const item = createMockMediaItem({ kind: 'audio', mimeType: 'audio/mp3' });
      const { container } = renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      // Audio icon should be present
      const svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBeGreaterThan(0);
    });

    it('renders file icon for other kind', () => {
      const item = createMockMediaItem({ kind: 'other', mimeType: 'application/pdf' });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      // Should show file size
      expect(screen.getByText('1024 B')).toBeInTheDocument();
    });
  });
});
