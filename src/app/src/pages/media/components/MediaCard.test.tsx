import type { ReactNode } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockIntersectionObserver, mockMatchMedia } from '@app/tests/browserMocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaCard } from './MediaCard';

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
}));

// Wrapper component with providers
const Wrapper = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderWithProviders = (ui: ReactNode) => render(ui, { wrapper: Wrapper });

const getPrimaryAction = (name: string | RegExp = 'Image: Test Evaluation') =>
  screen.getByRole('button', { name });

const getCardContainer = (name?: string | RegExp) => {
  const primaryAction = getPrimaryAction(name);
  expect(primaryAction.parentElement).not.toBeNull();
  return primaryAction.parentElement as HTMLElement;
};

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
    mockMatchMedia({ matches: (query) => query === '(hover: hover)' });
    mockIntersectionObserver();
  });

  describe('rendering', () => {
    it('renders the media card with an accessible primary action button', () => {
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      const card = getPrimaryAction();
      expect(card).toBeInTheDocument();
      expect(card.tagName).toBe('BUTTON');
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
      renderWithProviders(<MediaCard item={item} onClick={onClick} />);

      await user.click(getPrimaryAction());

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('activates via Enter key (native button behavior)', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={onClick} />);

      await user.tab();
      expect(getPrimaryAction()).toHaveFocus();
      await user.keyboard('{Enter}');

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('activates via Space key (native button behavior)', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={onClick} />);

      await user.tab();
      expect(getPrimaryAction()).toHaveFocus();
      await user.keyboard(' ');

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
      renderWithProviders(
        <MediaCard
          item={item}
          onClick={onClick}
          isSelectionMode={true}
          isSelected={false}
          onToggleSelection={onToggleSelection}
        />,
      );

      await user.click(getPrimaryAction('Image: Test Evaluation (not selected)'));

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
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} isViewing={true} />);

      expect(getCardContainer('Image: Test Evaluation (currently viewing)')).toHaveClass(
        'border-primary',
        'ring-2',
      );
    });

    it('applies selected styles when isSelected is true', () => {
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

      expect(getCardContainer('Image: Test Evaluation (selected)')).toHaveClass('border-primary');
    });

    it('applies focused styles when isFocused is true', () => {
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} isFocused={true} />);

      expect(getCardContainer()).toHaveClass('ring-2');
    });
  });

  describe('accessibility', () => {
    it('has correct aria-label for basic card', () => {
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      const card = getPrimaryAction();
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('Image'));
    });

    it('includes viewing state in aria-label', () => {
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} isViewing={true} />);

      const card = getPrimaryAction('Image: Test Evaluation (currently viewing)');
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('currently viewing'));
    });

    it('includes selection state in aria-label', () => {
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

      const card = getPrimaryAction('Image: Test Evaluation (selected)');
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('selected'));
    });

    it('calls onFocus callback', async () => {
      const user = userEvent.setup();
      const onFocus = vi.fn();
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} onFocus={onFocus} />);

      await user.tab();

      expect(onFocus).toHaveBeenCalledTimes(1);
    });

    it('supports custom tabIndex', () => {
      const item = createMockMediaItem();
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} tabIndex={-1} />);

      const card = getPrimaryAction();
      expect(card).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('media types', () => {
    it('renders video badge for video kind', () => {
      const item = createMockMediaItem({ kind: 'video', mimeType: 'video/mp4' });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Play video preview' })).toBeInTheDocument();
    });

    it('renders audio badge for audio kind', () => {
      const item = createMockMediaItem({ kind: 'audio', mimeType: 'audio/mp3' });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Play audio preview' })).toBeInTheDocument();
    });

    it('renders file icon for other kind', () => {
      const item = createMockMediaItem({ kind: 'other', mimeType: 'application/pdf' });
      renderWithProviders(<MediaCard item={item} onClick={vi.fn()} />);

      // Should show file size
      expect(screen.getByText('1024 B')).toBeInTheDocument();
    });
  });
});
