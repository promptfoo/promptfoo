import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('./YamlEditor', () => ({
  default: () => <div data-testid="yaml-editor">YAML Editor</div>,
}));

vi.mock('./RunTestSuiteButton', () => ({
  default: () => <button data-testid="run-test-suite-button">Run Test Suite</button>,
}));

import { useStore } from '@app/stores/evalConfig';

afterEach(() => {
  vi.resetAllMocks();
});

function renderWithConfig(config: Record<string, unknown>) {
  vi.mocked(useStore).mockReturnValue({
    config,
    getTestSuite: vi.fn(() => ({})),
  } as any);
  return render(<ConfigPreview />);
}

describe('ConfigPreview', () => {
  describe('counting logic', () => {
    it('displays correct counts for providers, prompts, and tests', () => {
      renderWithConfig({
        providers: [{ id: 'openai:gpt-4' }, { id: 'anthropic:claude-3' }],
        prompts: ['Hello {{name}}', 'Goodbye {{name}}', 'Test prompt'],
        tests: [{ description: 'Test 1' }],
      });

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('displays zero for empty arrays', () => {
      renderWithConfig({ providers: [], prompts: [], tests: [] });

      expect(screen.getAllByText('0')).toHaveLength(3);
    });

    it('handles undefined and non-array values as zero', () => {
      renderWithConfig({ providers: undefined, prompts: 'not an array', tests: null });

      expect(screen.getAllByText('0')).toHaveLength(3);
    });
  });

  describe('empty state styling', () => {
    it('applies warning color to empty counts and normal color to non-empty', () => {
      renderWithConfig({
        providers: [{ id: 'openai:gpt-4' }],
        prompts: [],
        tests: [{ description: 'Test 1' }, { description: 'Test 2' }],
      });

      const providersRow = screen.getByText('Providers').closest('div');
      expect(providersRow?.querySelector('.text-foreground')).toHaveTextContent('1');

      const promptsRow = screen.getByText('Prompts').closest('div');
      expect(promptsRow?.querySelector('.text-amber-600')).toHaveTextContent('0');

      const testsRow = screen.getByText('Test Cases').closest('div');
      expect(testsRow?.querySelector('.text-foreground')).toHaveTextContent('2');
    });
  });

  describe('view switching', () => {
    it('toggles between preview and yaml views', async () => {
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

      expect(screen.getByText('Providers')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: /yaml/i }));
      expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: /preview/i }));
      expect(screen.getByText('Providers')).toBeInTheDocument();
    });
  });
});
