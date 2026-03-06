import { renderWithProviders as baseRender } from '@app/utils/testutils';
import { type EvaluateTableOutput, ResultFailureReason } from '@promptfoo/types';
import { screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftKeyProvider } from '../../../contexts/ShiftKeyContext';
import EvalOutputCell from './EvalOutputCell';

import type { EvalOutputCellProps } from './EvalOutputCell';

// Mock the EvalOutputPromptDialog component
vi.mock('./EvalOutputPromptDialog', () => ({
  default: vi.fn(() => <div data-testid="dialog-component">Mocked Dialog Component</div>),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return baseRender(<ShiftKeyProvider>{ui}</ShiftKeyProvider>);
};

vi.mock('./store', () => ({
  useResultsViewSettingsStore: () => ({
    prettifyJson: false,
    renderMarkdown: false,
    showPassFail: false,
    showPassReasons: false,
    showPrompts: false,
    maxImageWidth: 256,
    maxImageHeight: 256,
  }),
  useTableStore: () => ({
    shouldHighlightSearchText: false,
  }),
}));

vi.mock('../../../hooks/useShiftKey', () => ({
  useShiftKey: () => false,
}));

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

interface MockEvalOutputCellProps extends EvalOutputCellProps {
  firstOutput: EvaluateTableOutput;
  searchText: string;
  showDiffs: boolean;
}

/**
 * Tests for duplicate image prevention logic (GitHub issue fix).
 * These tests verify that when the primary output is rendered as an image
 * (data URI, blob ref, or SVG), the first entry in output.images is skipped
 * to avoid rendering the same image twice.
 */
describe('EvalOutputCell duplicate image prevention', () => {
  const mockOnRating = vi.fn();

  const createBaseProps = (overrides?: Partial<EvaluateTableOutput>): MockEvalOutputCellProps => ({
    firstOutput: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'google:gemini-3.1-flash-image-preview',
      score: 1.0,
      text: 'Test output text',
      testCase: {},
    },
    maxTextLength: 1000,
    onRating: mockOnRating,
    output: {
      cost: 0,
      id: 'test-id',
      latencyMs: 100,
      namedScores: {},
      pass: true,
      failureReason: ResultFailureReason.NONE,
      prompt: 'Test prompt',
      provider: 'google:gemini-3.1-flash-image-preview',
      score: 1.0,
      text: 'Test output text',
      testCase: {},
      ...overrides,
    },
    promptIndex: 0,
    rowIndex: 0,
    searchText: '',
    showDiffs: false,
    showStats: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('primaryRenderedAsImage detection', () => {
    it('should detect data URI with image/png as primary rendered image', () => {
      const dataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const props = createBaseProps({
        text: dataUri,
        images: [
          // This duplicate should be skipped (resolveImageSource converts base64 to data URI)
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          // This additional image should be rendered
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render exactly 2 images: the primary from text + 1 additional (skipping first in array)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should detect data URI with image/jpeg as primary rendered image', () => {
      const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQ==';
      const props = createBaseProps({
        text: dataUri,
        images: [
          { data: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQ==' },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render 2 images: primary + 1 additional (skipping first duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should detect data URI with application/octet-stream as primary rendered image', () => {
      const dataUri =
        'data:application/octet-stream;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const props = createBaseProps({
        text: dataUri,
        images: [{ data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render only 1 image (the primary, skipping the duplicate in images array)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });

    it('should detect data URI with image/svg+xml as primary rendered image', () => {
      const dataUri = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PC9zdmc+';
      const props = createBaseProps({
        text: dataUri,
        images: [
          { data: 'PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PC9zdmc+' },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render 2 images: primary + 1 additional (skipping first duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should detect data URI without base64 marker as primary rendered image', () => {
      const dataUri =
        'data:image/png;iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const props = createBaseProps({
        text: dataUri,
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render only 1 image (primary, skipping duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });

    it('should detect blob reference (resolved by resolveImageSource) as primary rendered image', () => {
      // This test verifies that when resolveImageSource returns a value for text (blob ref),
      // it's detected as a primary rendered image and skips the first item in images array
      const blobRef =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      const props = createBaseProps({
        text: blobRef, // This is long enough base64 to be detected by resolveImageSource
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render 2 images: primary blob + 1 additional (skipping first duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should detect raw SVG content (starts with <svg) as primary rendered image', () => {
      const svgContent =
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>';
      const props = createBaseProps({
        text: svgContent,
        images: [
          {
            data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48L3N2Zz4=',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render 2 images: primary SVG + 1 additional (skipping first duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should detect raw SVG with leading whitespace as primary rendered image', () => {
      const svgContent =
        '  \n\t  <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="red"/></svg>';
      const props = createBaseProps({
        text: svgContent,
        images: [
          {
            data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCI+PC9zdmc+',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render only 1 image (primary SVG, skipping duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });

    it('should NOT detect regular text as primary rendered image', () => {
      const props = createBaseProps({
        text: 'This is just regular text output, not an image',
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render all 2 images (no primary image, so nothing is skipped)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should NOT detect text starting with "data:" but not an image MIME type as primary rendered image', () => {
      const dataUri = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
      const props = createBaseProps({
        text: dataUri,
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render all 2 images (text data URI is not an image)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });
  });

  describe('image array slicing behavior', () => {
    it('should skip first image when primary is rendered as image', () => {
      const dataUri = 'data:image/png;base64,primary-image-data';
      const props = createBaseProps({
        text: dataUri,
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAHElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render 3 images: primary + 2 additional (skipping first duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(3);
    });

    it('should render all images when primary is NOT rendered as image', () => {
      const props = createBaseProps({
        text: 'Just regular text, no image here',
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAHElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render all 3 images (no primary image to skip)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(3);
    });

    it('should handle single image in array when primary is rendered as image', () => {
      const dataUri = 'data:image/png;base64,primary-image-data';
      const props = createBaseProps({
        text: dataUri,
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render only 1 image (primary, skipping the only duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });

    it('should handle empty images array after slicing', () => {
      const dataUri = 'data:image/png;base64,primary-image-data';
      const props = createBaseProps({
        text: dataUri,
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render 1 image (primary only, since slicing leaves empty array)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);

      // Verify the primary image is rendered
      expect(images[0].getAttribute('src')).toBe(dataUri);
    });

    it('should not render any additional images if array only had the duplicate', () => {
      const svgContent = '<svg width="100" height="100"></svg>';
      const props = createBaseProps({
        text: svgContent,
        images: [{ data: 'PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PC9zdmc+' }],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render exactly 1 image (the primary SVG)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);

      // Verify it's a data URI (SVG converted to base64)
      expect(images[0].getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined images array', () => {
      const dataUri = 'data:image/png;base64,primary-image-data';
      const props = createBaseProps({
        text: dataUri,
        images: undefined,
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render only the primary image
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });

    it('should handle empty images array', () => {
      const dataUri = 'data:image/png;base64,primary-image-data';
      const props = createBaseProps({
        text: dataUri,
        images: [],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render only the primary image
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });

    it('should handle null text with images array', () => {
      const props = createBaseProps({
        text: null as unknown as string,
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render all images (no primary image)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should handle empty string text with images array', () => {
      const props = createBaseProps({
        text: '',
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render all images (no primary image from empty text)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should handle images with null data gracefully', () => {
      const dataUri = 'data:image/png;base64,primary-image-data';
      const props = createBaseProps({
        text: dataUri,
        images: [
          { data: null as unknown as string },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render 2 images: primary + 1 valid (null data image won't render but won't break)
      const images = container.querySelectorAll('img');
      expect(images.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve image alt text', () => {
      const dataUri = 'data:image/png;base64,primary-image-data';
      const props = createBaseProps({
        text: dataUri,
        prompt: 'Generate a blue circle',
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      const images = container.querySelectorAll('img');

      // Primary image should use prompt as alt
      expect(images[0].getAttribute('alt')).toBe('Generate a blue circle');

      // Additional images from the images array should use prompt OR 'Generated image' as alt
      // (The actual implementation uses `output.prompt || 'Generated image'`)
      if (images[1]) {
        expect(images[1].getAttribute('alt')).toBe('Generate a blue circle');
      }
    });

    it('should handle case where resolveImageSource returns undefined for text but images exist', () => {
      const props = createBaseProps({
        text: 'some-invalid-blob-ref',
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render all images (resolveImageSource returns undefined, so no primary image)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });
  });

  describe('integration with different output types', () => {
    it('should work correctly when output has both text and images from Gemini', () => {
      // Simulate a Gemini response with text+image format
      const props = createBaseProps({
        text: 'data:image/png;base64,gemini-generated-image',
        provider: 'google:gemini-3.1-flash-image-preview',
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should prevent duplicate: render primary + 1 additional (skip first duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
    });

    it('should not interfere with text-only output', () => {
      const props = createBaseProps({
        text: 'This is a regular text response without any images',
        images: undefined,
      });

      renderWithProviders(<EvalOutputCell {...props} />);

      // Should display text normally
      expect(
        screen.getByText('This is a regular text response without any images'),
      ).toBeInTheDocument();
    });

    it('should not interfere with audio output', () => {
      const props = createBaseProps({
        text: '',
        audio: {
          data: 'base64-audio-data',
          transcript: 'Audio transcript',
        },
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render audio player and all images (no primary image from text)
      expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });

    it('should work with video output that has thumbnail', () => {
      const props = createBaseProps({
        text: '',
        video: {
          url: '/api/video/test.mp4',
        },
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should render video and all images
      expect(screen.getByTestId('video-player')).toBeInTheDocument();
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
    });
  });

  describe('regression prevention', () => {
    it('should NOT render duplicate images when Gemini returns both text field and images array with same image', () => {
      // This is the exact bug scenario that was fixed
      const imageDataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const props = createBaseProps({
        text: imageDataUri,
        provider: 'google:gemini-3.1-flash-image-preview',
        images: [
          // This is the duplicate that should be skipped
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Critical: Should render exactly 1 image (the primary), NOT 2 duplicates
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);

      // Verify it's the primary image
      expect(images[0].getAttribute('src')).toBe(imageDataUri);
    });

    it('should correctly show additional images beyond the first when primary is rendered', () => {
      // Ensure the fix doesn't break the ability to show truly additional images
      const primaryImageUri = 'data:image/png;base64,primary-image';

      const props = createBaseProps({
        text: primaryImageUri,
        images: [
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAHElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      });

      const { container } = renderWithProviders(<EvalOutputCell {...props} />);

      // Should show: primary + 2 additional (skipping only the first duplicate)
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(3);
    });
  });
});
