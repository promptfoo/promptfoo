import type { ReactNode } from 'react';

import { mockMatchMedia } from '@app/tests/browserMocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaModal } from './MediaModal';

import type { MediaItem } from '../types';

// Mock the API utilities
vi.mock('@app/utils/api', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
}));

// Mock the media utilities
vi.mock('@app/utils/media', () => ({
  downloadMediaItem: vi.fn(),
  formatBytes: (bytes: number) => `${bytes} B`,
  formatCost: (cost: number) => `$${cost.toFixed(2)}`,
  formatLatency: (ms: number) => `${ms}ms`,
  formatMediaDate: (date: string) => date,
  getKindIcon: () => (props: { className?: string }) => <svg data-testid="kind-icon" {...props} />,
  getKindLabel: (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1),
  MEDIA_MAX_ZOOM: 5,
  MEDIA_MIN_ZOOM: 1,
  MEDIA_ZOOM_STEP: 1.5,
  MEDIA_ZOOM_WHEEL_STEP: 1.1,
}));

// Mock AudioWaveform
vi.mock('./AudioWaveform', () => ({
  AudioWaveform: () => <div data-testid="audio-waveform" />,
}));

// Wrapper with router context (required for Link components)
const Wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const renderModal = (ui: ReactNode) => render(ui, { wrapper: Wrapper });

const createMockItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  hash: 'abc123def456',
  mimeType: 'image/png',
  sizeBytes: 2048,
  kind: 'image',
  createdAt: '2024-01-01T00:00:00Z',
  url: '/api/blobs/abc123def456',
  context: {
    evalId: 'eval-123',
    evalDescription: 'Test Evaluation',
    testIdx: 0,
    promptIdx: 0,
    provider: 'openai/dall-e-3',
    pass: true,
    score: 0.85,
    ...overrides.context,
  },
  ...overrides,
});

const createMockItems = (count: number): MediaItem[] =>
  Array.from({ length: count }, (_, i) =>
    createMockItem({
      hash: `hash-${i}`,
      url: `/api/blobs/hash-${i}`,
      context: {
        evalId: `eval-${i}`,
        evalDescription: `Evaluation ${i + 1}`,
      },
    }),
  );

describe('MediaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMatchMedia({
      matches: (query) =>
        query === '(prefers-reduced-motion: reduce)' ? false : query === '(hover: hover)',
    });
  });

  describe('rendering', () => {
    it('renders nothing when item is null', () => {
      const { container } = renderModal(
        <MediaModal item={null} items={[]} onClose={vi.fn()} onNavigate={vi.fn()} />,
      );

      expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    });

    it('renders dialog when item is provided', () => {
      const item = createMockItem();
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders image preview for image kind', () => {
      const item = createMockItem({ kind: 'image' });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'http://localhost:3000/api/blobs/abc123def456');
    });

    it('renders audio waveform for audio kind', () => {
      const item = createMockItem({ kind: 'audio', mimeType: 'audio/mp3' });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByTestId('audio-waveform')).toBeInTheDocument();
    });

    it('renders file icon for other kind', () => {
      const item = createMockItem({ kind: 'other', mimeType: 'application/pdf' });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByText('Preview not available')).toBeInTheDocument();
    });
  });

  describe('details panel', () => {
    it('shows pass status when item passes', () => {
      const item = createMockItem({ context: { evalId: 'e', pass: true } });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByText('Passed')).toBeInTheDocument();
    });

    it('shows fail status when item fails', () => {
      const item = createMockItem({ context: { evalId: 'e', pass: false } });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('shows score ring when score is present', () => {
      const item = createMockItem({ context: { evalId: 'e', score: 0.85 } });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '85');
    });

    it('shows provider name', () => {
      const item = createMockItem({ context: { evalId: 'e', provider: 'openai/dall-e-3' } });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByText('openai/dall-e-3')).toBeInTheDocument();
    });

    it('shows prompt when present', () => {
      const item = createMockItem({
        context: { evalId: 'e', prompt: 'Generate a red panda' },
      });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByText('Prompt')).toBeInTheDocument();
      expect(screen.getByText('Generate a red panda')).toBeInTheDocument();
    });

    it('shows grader results when present', () => {
      const item = createMockItem({
        context: {
          evalId: 'e',
          graderResults: [
            { name: 'Quality', pass: true, score: 0.9, reason: 'Good quality' },
            { name: 'Safety', pass: false, score: 0.3, reason: 'Unsafe content' },
          ],
        },
      });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByText('Assertions')).toBeInTheDocument();
      expect(screen.getByText('Quality')).toBeInTheDocument();
      expect(screen.getByText('Safety')).toBeInTheDocument();
    });

    it('expands grader reason on click', async () => {
      const user = userEvent.setup();
      const item = createMockItem({
        context: {
          evalId: 'e',
          graderResults: [{ name: 'Quality', pass: true, score: 0.9, reason: 'Good quality' }],
        },
      });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      // Click the grader to expand
      await user.click(screen.getByText('Quality'));

      expect(screen.getByText('Good quality')).toBeInTheDocument();
    });

    it('toggles technical details section', async () => {
      const user = userEvent.setup();
      const item = createMockItem();
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      // Details should be hidden initially
      expect(screen.queryByText('Size')).not.toBeInTheDocument();

      // Click to show details
      await user.click(screen.getByText('Show technical details'));

      expect(screen.getByText('Size')).toBeInTheDocument();
      expect(screen.getByText('2048 B')).toBeInTheDocument();
    });

    it('shows eval link', () => {
      const item = createMockItem({
        context: { evalId: 'eval-123', evalDescription: 'My Eval' },
      });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByText('View in My Eval')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('shows navigation counter when multiple items', () => {
      const items = createMockItems(5);
      renderModal(
        <MediaModal item={items[2]} items={items} onClose={vi.fn()} onNavigate={vi.fn()} />,
      );

      expect(screen.getByText('3 / 5')).toBeInTheDocument();
    });

    it('does not show navigation counter for single item', () => {
      const item = createMockItem();
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
    });

    it('shows Previous button when not first item', () => {
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[1]} items={items} onClose={vi.fn()} onNavigate={vi.fn()} />,
      );

      expect(screen.getByLabelText('Previous')).toBeInTheDocument();
    });

    it('does not show Previous button for first item', () => {
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[0]} items={items} onClose={vi.fn()} onNavigate={vi.fn()} />,
      );

      expect(screen.queryByLabelText('Previous')).not.toBeInTheDocument();
    });

    it('shows Next button when not last item', () => {
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[1]} items={items} onClose={vi.fn()} onNavigate={vi.fn()} />,
      );

      expect(screen.getByLabelText('Next')).toBeInTheDocument();
    });

    it('does not show Next button for last item', () => {
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[2]} items={items} onClose={vi.fn()} onNavigate={vi.fn()} />,
      );

      expect(screen.queryByLabelText('Next')).not.toBeInTheDocument();
    });

    it('calls onNavigate with previous item when Previous is clicked', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[1]} items={items} onClose={vi.fn()} onNavigate={onNavigate} />,
      );

      await user.click(screen.getByLabelText('Previous'));

      expect(onNavigate).toHaveBeenCalledWith(items[0]);
    });

    it('calls onNavigate with next item when Next is clicked', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[1]} items={items} onClose={vi.fn()} onNavigate={onNavigate} />,
      );

      await user.click(screen.getByLabelText('Next'));

      expect(onNavigate).toHaveBeenCalledWith(items[2]);
    });
  });

  describe('zoom controls', () => {
    it('shows zoom controls for images', () => {
      const item = createMockItem({ kind: 'image' });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
      expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('updates zoom level when zoom in is clicked', async () => {
      const user = userEvent.setup();
      const item = createMockItem({ kind: 'image' });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      await user.click(screen.getByLabelText('Zoom in'));

      expect(screen.getByText('150%')).toBeInTheDocument();
    });

    it('shows reset button when zoomed', async () => {
      const user = userEvent.setup();
      const item = createMockItem({ kind: 'image' });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.queryByLabelText('Reset zoom')).not.toBeInTheDocument();

      await user.click(screen.getByLabelText('Zoom in'));

      expect(screen.getByLabelText('Reset zoom')).toBeInTheDocument();
    });

    it('does not show zoom controls for non-image types', () => {
      const item = createMockItem({ kind: 'audio', mimeType: 'audio/mp3' });
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      expect(screen.queryByLabelText('Zoom in')).not.toBeInTheDocument();
    });
  });

  describe('download', () => {
    it('calls downloadMediaItem when download button is clicked', async () => {
      const user = userEvent.setup();
      const { downloadMediaItem } = await import('@app/utils/media');
      const item = createMockItem();
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      // Click the footer download button
      const downloadButtons = screen.getAllByRole('button');
      const downloadBtn = downloadButtons.find(
        (btn) => btn.textContent?.includes('Download') && btn.closest('.border-t'),
      );
      if (downloadBtn) {
        await user.click(downloadBtn);
      }

      expect(downloadMediaItem).toHaveBeenCalledWith(
        'http://localhost:3000/api/blobs/abc123def456',
        'abc123def456',
        'image/png',
      );
    });
  });

  describe('keyboard shortcuts', () => {
    it('navigates left with ArrowLeft key', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[1]} items={items} onClose={vi.fn()} onNavigate={onNavigate} />,
      );

      await user.keyboard('{ArrowLeft}');

      expect(onNavigate).toHaveBeenCalledWith(items[0]);
    });

    it('navigates right with ArrowRight key', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const items = createMockItems(3);
      renderModal(
        <MediaModal item={items[1]} items={items} onClose={vi.fn()} onNavigate={onNavigate} />,
      );

      await user.keyboard('{ArrowRight}');

      expect(onNavigate).toHaveBeenCalledWith(items[2]);
    });

    it('triggers download with D key', async () => {
      const user = userEvent.setup();
      const { downloadMediaItem } = await import('@app/utils/media');
      const item = createMockItem();
      renderModal(<MediaModal item={item} items={[item]} onClose={vi.fn()} onNavigate={vi.fn()} />);

      await user.keyboard('d');

      expect(downloadMediaItem).toHaveBeenCalled();
    });
  });
});
