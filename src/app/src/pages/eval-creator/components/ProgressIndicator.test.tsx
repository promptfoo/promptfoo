import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProgressIndicator } from './ProgressIndicator';

// Mock the store
vi.mock('@app/stores/evalConfig', () => ({
  useStore: vi.fn(),
}));

// Import after mocking to get the mocked version
import { useStore } from '@app/stores/evalConfig';

describe('ProgressIndicator - isStepComplete', () => {
  describe('providers step', () => {
    it('marks providers as complete when providers array has items', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'openai:gpt-4' }],
          prompts: [],
          tests: [],
        },
      } as any);

      render(<ProgressIndicator />);

      const providersStep = screen.getByText('Providers');
      expect(providersStep).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
    });

    it('marks providers as incomplete when providers array is empty', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: [],
          tests: [],
        },
      } as any);

      render(<ProgressIndicator />);

      const providersStep = screen.getByText('Providers');
      expect(providersStep).toHaveClass('text-muted-foreground');
    });

    it('marks providers as incomplete when providers is not an array', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: null,
          prompts: [],
          tests: [],
        },
      } as any);

      render(<ProgressIndicator />);

      const providersStep = screen.getByText('Providers');
      expect(providersStep).toHaveClass('text-muted-foreground');
    });
  });

  describe('prompts step', () => {
    it('marks prompts as complete when prompts array has items', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: ['Hello {{name}}'],
          tests: [],
        },
      } as any);

      render(<ProgressIndicator />);

      const promptsStep = screen.getByText('Prompts');
      expect(promptsStep).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
    });

    it('marks prompts as incomplete when prompts array is empty', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: [],
          tests: [],
        },
      } as any);

      render(<ProgressIndicator />);

      const promptsStep = screen.getByText('Prompts');
      expect(promptsStep).toHaveClass('text-muted-foreground');
    });

    it('marks prompts as incomplete when prompts is not an array', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: undefined,
          tests: [],
        },
      } as any);

      render(<ProgressIndicator />);

      const promptsStep = screen.getByText('Prompts');
      expect(promptsStep).toHaveClass('text-muted-foreground');
    });
  });

  describe('tests step', () => {
    it('marks tests as complete when tests array has items', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: [],
          tests: [{ description: 'Test case 1' }],
        },
      } as any);

      render(<ProgressIndicator />);

      const testsStep = screen.getByText('Test Cases');
      expect(testsStep).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
    });

    it('marks tests as incomplete when tests array is empty', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: [],
          tests: [],
        },
      } as any);

      render(<ProgressIndicator />);

      const testsStep = screen.getByText('Test Cases');
      expect(testsStep).toHaveClass('text-muted-foreground');
    });

    it('marks tests as incomplete when tests is not an array', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [],
          prompts: [],
          tests: null,
        },
      } as any);

      render(<ProgressIndicator />);

      const testsStep = screen.getByText('Test Cases');
      expect(testsStep).toHaveClass('text-muted-foreground');
    });
  });

  describe('all steps complete', () => {
    it('marks all steps as complete when all arrays have items', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'openai:gpt-4' }],
          prompts: ['Hello {{name}}'],
          tests: [{ description: 'Test case 1' }],
        },
      } as any);

      render(<ProgressIndicator />);

      expect(screen.getByText('Providers')).toHaveClass(
        'text-emerald-700',
        'dark:text-emerald-300',
      );
      expect(screen.getByText('Prompts')).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
      expect(screen.getByText('Test Cases')).toHaveClass(
        'text-emerald-700',
        'dark:text-emerald-300',
      );
    });
  });

  describe('mixed completion states', () => {
    it('handles partially complete configuration', () => {
      vi.mocked(useStore).mockReturnValue({
        config: {
          providers: [{ id: 'openai:gpt-4' }],
          prompts: [],
          tests: [{ description: 'Test case 1' }],
        },
      } as any);

      render(<ProgressIndicator />);

      expect(screen.getByText('Providers')).toHaveClass(
        'text-emerald-700',
        'dark:text-emerald-300',
      );
      expect(screen.getByText('Prompts')).toHaveClass('text-muted-foreground');
      expect(screen.getByText('Test Cases')).toHaveClass(
        'text-emerald-700',
        'dark:text-emerald-300',
      );
    });
  });
});
