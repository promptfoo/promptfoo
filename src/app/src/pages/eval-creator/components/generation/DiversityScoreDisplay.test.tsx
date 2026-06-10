import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiversityScoreDisplay } from './DiversityScoreDisplay';

import type { DiversityMetrics } from '../../api/generation';

function renderDisplay(
  diversity: DiversityMetrics | null,
  props: { compact?: boolean; onImprove?: () => void } = {},
) {
  return render(
    <TooltipProvider delayDuration={0}>
      <DiversityScoreDisplay diversity={diversity} {...props} />
    </TooltipProvider>,
  );
}

function createDiversity(overrides: Partial<DiversityMetrics> = {}): DiversityMetrics {
  return {
    score: 0.82,
    clusters: 3,
    gaps: [],
    ...overrides,
  };
}

describe('DiversityScoreDisplay', () => {
  it('renders nothing when no diversity metrics exist', () => {
    const { container } = renderDisplay(null);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders compact diversity output', () => {
    renderDisplay(createDiversity(), { compact: true });

    expect(screen.getByText('Diversity:')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('shows compact tooltip details without optional cluster copy', async () => {
    const user = userEvent.setup();
    renderDisplay(
      createDiversity({
        score: 0.5,
        clusters: undefined,
        gaps: undefined,
      }),
      { compact: true },
    );

    await user.hover(screen.getByText('Diversity:'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Diversity score: 50%');
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('clusters');
  });

  it('includes cluster counts in compact tooltip output when present', async () => {
    const user = userEvent.setup();
    renderDisplay(createDiversity({ score: 0.65, clusters: 4 }), { compact: true });

    await user.hover(screen.getByText('Diversity:'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Diversity score: 65% • 4 clusters',
    );
  });

  it('shows improvement guidance for low-diversity results', async () => {
    const onImprove = vi.fn();
    const user = userEvent.setup();
    renderDisplay(
      createDiversity({
        score: 0.35,
        clusters: 2,
        gaps: [
          'Need enterprise examples',
          'Need short prompts',
          'Need long prompts',
          'Need code prompts',
        ],
      }),
      { onImprove },
    );

    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('2 clusters')).toBeInTheDocument();
    expect(screen.getByText('Coverage gaps:')).toBeInTheDocument();
    expect(screen.getByText('... and 1 more')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Improve diversity/ }));

    expect(onImprove).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0.65, 'Good'],
    [0.45, 'Fair'],
    [0.85, 'Excellent'],
  ])('labels a %.2f diversity score as %s without optional extras', (score, label) => {
    renderDisplay(createDiversity({ score, clusters: undefined, gaps: [] }));

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(/clusters/)).not.toBeInTheDocument();
    expect(screen.queryByText('Coverage gaps:')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Improve diversity/ })).not.toBeInTheDocument();
  });

  it('renders the full tooltip and withholds improvement for already-healthy diversity', async () => {
    const onImprove = vi.fn();
    const user = userEvent.setup();
    const { container } = renderDisplay(
      createDiversity({
        score: 0.82,
        clusters: undefined,
        gaps: ['One remaining gap'],
      }),
      { onImprove },
    );
    const tooltipTrigger = container.querySelector('button');

    expect(tooltipTrigger).not.toBeNull();
    await user.hover(tooltipTrigger as HTMLButtonElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Diversity measures how varied');
    expect(screen.queryByRole('button', { name: /Improve diversity/ })).not.toBeInTheDocument();
    expect(onImprove).not.toHaveBeenCalled();
  });

  it('renders low diversity without an improvement action when no callback exists', () => {
    renderDisplay(
      createDiversity({
        score: 0.1,
        clusters: 0,
        gaps: undefined,
      }),
    );

    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.queryByText(/clusters/)).not.toBeInTheDocument();
    expect(screen.queryByText('Coverage gaps:')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Improve diversity/ })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveClass('[&>div]:bg-red-500');
  });

  it('normalizes sparse diversity payloads in compact mode', async () => {
    const user = userEvent.setup();
    renderDisplay({} as DiversityMetrics, { compact: true });

    expect(screen.getByText('Low')).toBeInTheDocument();
    await user.hover(screen.getByText('Diversity:'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Diversity score: 0%');
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('clusters');
  });

  it('shows a single gap without overflow copy', () => {
    renderDisplay(
      createDiversity({
        score: 0.55,
        clusters: 0,
        gaps: ['Need one more scenario'],
      }),
    );

    expect(screen.getByText('Fair')).toBeInTheDocument();
    expect(screen.getByText('Coverage gaps:')).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('Need one more scenario')),
    ).toBeInTheDocument();
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });
});
