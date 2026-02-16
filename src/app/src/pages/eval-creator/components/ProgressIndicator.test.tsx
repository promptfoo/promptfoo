import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressIndicator } from './ProgressIndicator';

vi.mock('@app/stores/evalConfig', () => ({
  useStore: vi.fn(),
}));

import { useStore } from '@app/stores/evalConfig';

afterEach(() => {
  vi.resetAllMocks();
});

function renderWithConfig(config: Record<string, unknown>) {
  vi.mocked(useStore).mockReturnValue({ config } as any);
  return render(<ProgressIndicator />);
}

describe('ProgressIndicator', () => {
  it.each([
    ['Providers', { providers: [{ id: 'openai:gpt-4' }], prompts: [], tests: [] }],
    ['Prompts', { providers: [], prompts: ['Hello {{name}}'], tests: [] }],
    ['Test Cases', { providers: [], prompts: [], tests: [{ description: 'Test 1' }] }],
  ])('marks %s as complete when its array has items', (label, config) => {
    renderWithConfig(config);

    expect(screen.getByText(label)).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
  });

  it.each([
    ['Providers', { providers: [], prompts: [], tests: [] }],
    ['Prompts', { providers: [], prompts: [], tests: [] }],
    ['Test Cases', { providers: [], prompts: [], tests: [] }],
  ])('marks %s as incomplete when its array is empty', (label, config) => {
    renderWithConfig(config);

    expect(screen.getByText(label)).toHaveClass('text-muted-foreground');
  });

  it('marks steps as incomplete for non-array values', () => {
    renderWithConfig({ providers: null, prompts: undefined, tests: null });

    expect(screen.getByText('Providers')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Prompts')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Test Cases')).toHaveClass('text-muted-foreground');
  });

  it('marks all steps as complete when all arrays have items', () => {
    renderWithConfig({
      providers: [{ id: 'openai:gpt-4' }],
      prompts: ['Hello {{name}}'],
      tests: [{ description: 'Test 1' }],
    });

    expect(screen.getByText('Providers')).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
    expect(screen.getByText('Prompts')).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
    expect(screen.getByText('Test Cases')).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
  });

  it('handles partially complete configuration', () => {
    renderWithConfig({
      providers: [{ id: 'openai:gpt-4' }],
      prompts: [],
      tests: [{ description: 'Test 1' }],
    });

    expect(screen.getByText('Providers')).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
    expect(screen.getByText('Prompts')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Test Cases')).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
  });
});
