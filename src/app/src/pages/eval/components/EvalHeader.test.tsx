import { TooltipProvider } from '@app/components/ui/tooltip';
import { fetchUserEmail } from '@app/utils/api';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalHeader from './EvalHeader';
import { useTableStore } from './store';

vi.mock('@app/utils/api', () => ({
  fetchUserEmail: vi.fn(),
  updateEvalAuthor: vi.fn(),
}));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('./EvalSelectorDialog', () => ({ default: () => null }));
vi.mock('./EvalSelectorKeyboardShortcut', () => ({ default: () => null }));
vi.mock('./store', () => ({ useTableStore: vi.fn() }));

describe('EvalHeader', () => {
  beforeEach(() => {
    vi.mocked(fetchUserEmail).mockResolvedValue(null);
    vi.mocked(useTableStore).mockReturnValue({
      config: { redteam: {} },
      totalResultsCount: 12,
      stats: null,
      table: {
        head: {
          prompts: [{ provider: 'cached-provider', metrics: { tokenUsage: { numRequests: 0 } } }],
        },
      },
      setAuthor: vi.fn(),
    } as ReturnType<typeof useTableStore>);
  });

  it('preserves an explicit zero probe count for a fully cached evaluation', () => {
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

    expect(screen.getByText('PROBES').closest('button')).toHaveTextContent('PROBES0');
  });
});
