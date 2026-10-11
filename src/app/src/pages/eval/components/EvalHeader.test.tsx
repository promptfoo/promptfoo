import { act } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { fetchUserEmail } from '@app/utils/api';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvalHeader from './EvalHeader';
import { useTableStore } from './store';

vi.mock('@app/utils/api', () => ({
  fetchUserEmail: vi.fn(),
  updateEvalAuthor: vi.fn(),
}));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('./EvalSelectorDialog', () => ({ default: () => null }));
vi.mock('./EvalSelectorKeyboardShortcut', () => ({ default: () => null }));

const initialState = useTableStore.getState();

function setCounts(counts: (number | undefined)[]) {
  act(() => {
    useTableStore.setState({
      config: { metadata: { redteam: true } },
      totalResultsCount: 12,
      table: {
        head: {
          vars: [],
          prompts: counts.map((count, index) => ({
            id: `prompt-${index}`,
            raw: 'Fixture prompt',
            label: `Prompt ${index}`,
            provider: `provider-${index}`,
            metrics: {
              score: 0,
              testPassCount: 0,
              testFailCount: 0,
              testErrorCount: 0,
              assertPassCount: 0,
              assertFailCount: 0,
              totalLatencyMs: 0,
              tokenUsage: count === undefined ? {} : { numRequests: count },
              namedScores: {},
              namedScoresCount: {},
              cost: 0,
            },
          })),
        },
        body: [],
      },
    });
  });
}

function renderHeader() {
  render(
    <TooltipProvider>
      <MemoryRouter>
        <EvalHeader
          recentEvals={[]}
          onRecentEvalSelected={vi.fn()}
          activeView="results"
          onActiveViewChange={vi.fn()}
        />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe('EvalHeader probe counts', () => {
  beforeEach(() => {
    vi.mocked(fetchUserEmail).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    act(() => useTableStore.setState(initialState, true));
    vi.resetAllMocks();
  });

  it.each([
    { counts: [0], expected: 0 },
    { counts: [2, 3], expected: 5 },
    { counts: [0, 3], expected: 3 },
    { counts: [undefined, 0], expected: 0 },
    { counts: [undefined, undefined], expected: 12 },
    { counts: [], expected: 12 },
  ])('shows $expected for $counts', ({ counts, expected }) => {
    setCounts(counts);
    renderHeader();
    expect(screen.getByText('PROBES').closest('button')).toHaveTextContent(`PROBES${expected}`);
  });

  it('updates when the table prompt metrics change', () => {
    setCounts([0, 2]);
    renderHeader();
    setCounts([3, 4]);
    expect(screen.getByText('PROBES').closest('button')).toHaveTextContent('PROBES7');
  });
});
