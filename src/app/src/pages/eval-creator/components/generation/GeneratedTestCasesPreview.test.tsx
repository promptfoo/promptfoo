import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GeneratedTestCasesPreview } from './GeneratedTestCasesPreview';

import type { DatasetGenerationResult } from '../../api/generation';

function createResult(overrides: Partial<DatasetGenerationResult> = {}): DatasetGenerationResult {
  return {
    testCases: [{ city: 'Paris' }, { city: 'Berlin' }],
    edgeCases: [
      {
        vars: { city: 'Tokyo' },
        description: 'Edge case city',
        type: 'boundary',
      },
    ],
    diversity: {
      score: 0.75,
    },
    metadata: {
      totalGenerated: 3,
      durationMs: 25,
      provider: 'test',
    },
    ...overrides,
  };
}

describe('GeneratedTestCasesPreview', () => {
  it('supports bulk selection and adding the selected cases', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAdd = vi.fn();
    render(
      <GeneratedTestCasesPreview
        open={true}
        onClose={onClose}
        onAdd={onAdd}
        result={createResult()}
      />,
    );

    expect(screen.getByText('3 test cases')).toBeInTheDocument();
    expect(screen.getByText('2 core, 1 edge')).toBeInTheDocument();
    expect(screen.getByText('Diversity: 75%')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(screen.getByRole('button', { name: 'Add Selected (0)' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Add Selected (3)' }));

    expect(onAdd).toHaveBeenCalledWith([
      { vars: { city: 'Paris' }, description: 'Test Case #1', type: 'core' },
      { vars: { city: 'Berlin' }, description: 'Test Case #2', type: 'core' },
      {
        vars: { city: 'Tokyo' },
        description: 'Edge case city',
        type: 'edge',
        category: 'boundary',
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggles test case groups, individual rows, and regeneration', async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    render(
      <GeneratedTestCasesPreview
        open={true}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        onRegenerate={onRegenerate}
        result={createResult({
          testCases: [{ prompt: 'x'.repeat(30), audience: 'ops', tone: 'formal' }],
          diversity: { score: 0.35 },
        })}
      />,
    );

    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText(/prompt="xxxxxxxxxxxxxxxxxxxx\.\.\."/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Core Scenarios/ }));
    expect(screen.queryByText('Test Case #1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Core Scenarios/ }));
    expect(screen.getByText('Test Case #1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Edge Cases/ }));
    expect(screen.queryByText('Edge case city')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Edge Cases/ }));

    await user.click(screen.getByText('Test Case #1'));
    expect(screen.getByText('Selected: 1/2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('resets selection when regenerated result data changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <GeneratedTestCasesPreview
        open={true}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        result={createResult()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(screen.getByText('Selected: 0/3')).toBeInTheDocument();

    rerender(
      <GeneratedTestCasesPreview
        open={true}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        result={createResult({
          testCases: [{ city: 'Lisbon' }],
          edgeCases: [],
          diversity: { score: 0.9 },
        })}
      />,
    );

    expect(screen.getByText('Selected: 1/1')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });
});
