import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilterChips } from './FilterChips';
import { useApplyFilterFromMetric } from './hooks';
import { useTableStore } from './store';

const initialState = useTableStore.getState();

beforeEach(() => {
  act(() => useTableStore.setState(initialState, true));
});

afterEach(() => {
  cleanup();
  act(() => useTableStore.setState(initialState, true));
});

function addMetadataFilters(logicOperator: 'and' | 'or') {
  act(() => {
    for (const field of ['lang', 'tier']) {
      useTableStore.getState().addFilter({
        type: 'metadata',
        operator: 'equals',
        field,
        value: 'test',
        logicOperator,
      });
    }
  });
}

describe('metric filter operator inheritance', () => {
  it.each(['and', 'or'] as const)('inherits %s for metric and policy links', (operator) => {
    addMetadataFilters(operator);
    const { result } = renderHook(() => useApplyFilterFromMetric());

    for (const metric of ['Fluency', 'PolicyViolation:policy-id']) {
      act(() => result.current(metric));
      act(() => result.current(metric));
    }

    const { values } = useTableStore.getState().filters;
    const filters = Object.values(values);
    expect(filters).toHaveLength(4);
    expect(filters.map((filter) => filter.logicOperator)).toEqual([
      operator,
      operator,
      operator,
      operator,
    ]);
    expect(filters[filters.length - 1]).toMatchObject({
      type: 'policy',
      value: 'policy-id',
    });
  });

  it.each(['and', 'or'] as const)('inherits %s when toggling a metric chip', async (operator) => {
    addMetadataFilters(operator);
    act(() => {
      useTableStore.setState({
        config: { redteam: { plugins: [], strategies: [] } },
        table: {
          head: {
            vars: [],
            prompts: [
              {
                raw: 'test',
                label: 'test',
                provider: 'echo',
                metrics: {
                  score: 1,
                  testPassCount: 1,
                  testFailCount: 0,
                  testErrorCount: 0,
                  assertPassCount: 1,
                  assertFailCount: 0,
                  totalLatencyMs: 0,
                  tokenUsage: {},
                  cost: 0,
                  namedScores: { Fluency: 1 },
                  namedScoresCount: { Fluency: 1 },
                },
              },
            ],
          },
          body: [],
        },
      });
    });
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FilterChips />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Fluency/ }));
    const filters = Object.values(useTableStore.getState().filters.values);
    expect(filters).toHaveLength(3);
    expect(filters[filters.length - 1]).toMatchObject({ type: 'metric', logicOperator: operator });

    await user.click(screen.getByRole('button', { name: /Fluency/ }));
    expect(Object.values(useTableStore.getState().filters.values)).toHaveLength(2);
  });
});
