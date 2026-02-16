import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Mock the store
import { describe, expect, it, vi } from 'vitest';
import { ConfigPreview } from './ConfigPreview';

const mockGetTestSuite = vi.fn(() => ({}));

vi.mock('@app/stores/evalConfig', () => ({
  useStore: Object.assign(
    vi.fn(() => ({
      config: {},
      getTestSuite: mockGetTestSuite,
    })),
    {
      getState: () => ({
        config: {},
        getTestSuite: mockGetTestSuite,
      }),
    },
  ),
}));

// Mock the YamlEditor component
vi.mock('./YamlEditor', () => ({
  default: () => <div data-testid="yaml-editor">YAML Editor</div>,
}));

// Mock the RunTestSuiteButton component
vi.mock('./RunTestSuiteButton', () => ({
  default: () => <button data-testid="run-test-suite-button">Run Test Suite</button>,
}));

import { useStore } from '@app/stores/evalConfig';

describe('ConfigSummary component', () => {
  describe('counting logic', () => {
    it('counts providers correctly', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'openai:gpt-4' }, { id: 'anthropic:claude-3' }],
          prompts: [],
          tests: [],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      // The count should be displayed
      expect(screen.getByText('Providers')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('counts prompts correctly', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: ['Hello {{name}}', 'Goodbye {{name}}', 'Test prompt'],
          tests: [],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      expect(screen.getByText('Prompts')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('counts tests correctly', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: [],
          tests: [
            { description: 'Test 1' },
            { description: 'Test 2' },
            { description: 'Test 3' },
            { description: 'Test 4' },
          ],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      expect(screen.getByText('Test Cases')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('displays zero when arrays are empty', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: [],
          tests: [],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      // Should display three zeros (one for each category)
      const zeros = screen.getAllByText('0');
      expect(zeros).toHaveLength(3);
    });

    it('handles undefined arrays as zero count', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: undefined,
          prompts: undefined,
          tests: undefined,
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      const zeros = screen.getAllByText('0');
      expect(zeros).toHaveLength(3);
    });

    it('handles non-array values as zero count', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: null,
          prompts: 'not an array' as any,
          tests: {} as any,
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      const zeros = screen.getAllByText('0');
      expect(zeros).toHaveLength(3);
    });
  });

  describe('empty state styling', () => {
    it('applies amber/warning color to empty providers count', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: ['test'],
          tests: [{ description: 'test' }],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      const providersRow = screen.getByText('Providers').closest('div');
      const countElement = providersRow?.querySelector('.text-amber-600');
      expect(countElement).toBeInTheDocument();
      expect(countElement).toHaveTextContent('0');
    });

    it('applies amber/warning color to empty prompts count', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'test' }],
          prompts: [],
          tests: [{ description: 'test' }],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      const promptsRow = screen.getByText('Prompts').closest('div');
      const countElement = promptsRow?.querySelector('.text-amber-600');
      expect(countElement).toBeInTheDocument();
      expect(countElement).toHaveTextContent('0');
    });

    it('applies amber/warning color to empty tests count', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'test' }],
          prompts: ['test'],
          tests: [],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      const testsRow = screen.getByText('Test Cases').closest('div');
      const countElement = testsRow?.querySelector('.text-amber-600');
      expect(countElement).toBeInTheDocument();
      expect(countElement).toHaveTextContent('0');
    });

    it('applies normal foreground color to non-empty counts', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'test' }],
          prompts: ['test'],
          tests: [{ description: 'test' }],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      // All counts should be 1 and have normal foreground color
      const providersRow = screen.getByText('Providers').closest('div');
      const providersCount = providersRow?.querySelector('.text-foreground');
      expect(providersCount).toBeInTheDocument();
      expect(providersCount).toHaveTextContent('1');

      const promptsRow = screen.getByText('Prompts').closest('div');
      const promptsCount = promptsRow?.querySelector('.text-foreground');
      expect(promptsCount).toBeInTheDocument();
      expect(promptsCount).toHaveTextContent('1');

      const testsRow = screen.getByText('Test Cases').closest('div');
      const testsCount = testsRow?.querySelector('.text-foreground');
      expect(testsCount).toBeInTheDocument();
      expect(testsCount).toHaveTextContent('1');
    });
  });

  describe('mixed configurations', () => {
    it('handles configuration with mixed empty and non-empty arrays', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'openai:gpt-4' }],
          prompts: [],
          tests: [{ description: 'Test 1' }, { description: 'Test 2' }],
        },
        getTestSuite: vi.fn(() => ({})),
      } as any);

      render(<ConfigPreview />);

      // Providers: 1 (normal color)
      const providersRow = screen.getByText('Providers').closest('div');
      expect(providersRow?.querySelector('.text-foreground')).toHaveTextContent('1');

      // Prompts: 0 (amber color)
      const promptsRow = screen.getByText('Prompts').closest('div');
      expect(promptsRow?.querySelector('.text-amber-600')).toHaveTextContent('0');

      // Tests: 2 (normal color)
      const testsRow = screen.getByText('Test Cases').closest('div');
      expect(testsRow?.querySelector('.text-foreground')).toHaveTextContent('2');
    });
  });

  describe('view switching', () => {
    it('switches from preview to yaml view when yaml tab is clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'test' }],
          prompts: ['test'],
          tests: [{ description: 'test' }],
        },
        getTestSuite: vi.fn(() => ({ providers: [], prompts: [], tests: [] })),
      } as any);

      render(<ConfigPreview />);

      // Should initially show preview
      expect(screen.getByText('Providers')).toBeInTheDocument();

      // Click the YAML tab
      const yamlTab = screen.getByRole('tab', { name: /yaml/i });
      await user.click(yamlTab);

      // Should now show YAML editor
      expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();
    });

    it('switches from yaml to preview view when preview tab is clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'test' }],
          prompts: ['test'],
          tests: [{ description: 'test' }],
        },
        getTestSuite: vi.fn(() => ({ providers: [], prompts: [], tests: [] })),
      } as any);

      render(<ConfigPreview />);

      // Click the YAML tab first
      const yamlTab = screen.getByRole('tab', { name: /yaml/i });
      await user.click(yamlTab);

      expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();

      // Click the Preview tab
      const previewTab = screen.getByRole('tab', { name: /preview/i });
      await user.click(previewTab);

      // Should now show preview again
      expect(screen.getByText('Providers')).toBeInTheDocument();
    });
  });
});
