import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CoverageAnalysisPanel } from './CoverageAnalysisPanel';

import type { CoverageAnalysis } from '../../api/generation';

function renderPanel(
  coverage: CoverageAnalysis | null,
  props: { compact?: boolean; onFillGaps?: () => void } = {},
) {
  return render(
    <TooltipProvider delayDuration={0}>
      <CoverageAnalysisPanel coverage={coverage} {...props} />
    </TooltipProvider>,
  );
}

function createCoverage(overrides: Partial<CoverageAnalysis> = {}): CoverageAnalysis {
  return {
    requirements: [
      {
        id: 'full',
        description: 'Full coverage requirement',
        coverageLevel: 'full',
        matchingAssertions: ['assertion-1'],
      },
      {
        id: 'partial',
        description: 'Partial coverage requirement',
        coverageLevel: 'partial',
        matchingAssertions: ['assertion-2'],
      },
      {
        id: 'none',
        description: 'Missing requirement',
        coverageLevel: 'none',
        matchingAssertions: [],
      },
    ],
    overallScore: 0.85,
    gaps: [],
    ...overrides,
  };
}

describe('CoverageAnalysisPanel', () => {
  it('renders nothing when no coverage exists', () => {
    const { container } = renderPanel(null);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders compact coverage progress', () => {
    renderPanel(createCoverage(), { compact: true });

    expect(screen.getByText('Coverage:')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('renders requirements, overflow copy, gaps, and gap filling action', async () => {
    const onFillGaps = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      createCoverage({
        overallScore: 0.45,
        requirements: [
          {
            id: 'full',
            description: 'Full coverage requirement',
            coverageLevel: 'full',
            matchingAssertions: ['assertion-1'],
          },
          {
            id: 'partial',
            description: 'Partial coverage requirement',
            coverageLevel: 'partial',
            matchingAssertions: ['assertion-2'],
          },
          {
            id: 'none-1',
            description: 'Missing requirement one',
            coverageLevel: 'none',
            matchingAssertions: [],
          },
          {
            id: 'none-2',
            description: 'Missing requirement two',
            coverageLevel: 'none',
            matchingAssertions: [],
          },
          {
            id: 'none-3',
            description: 'Missing requirement three',
            coverageLevel: 'none',
            matchingAssertions: [],
          },
          {
            id: 'none-4',
            description: 'Missing requirement four',
            coverageLevel: 'none',
            matchingAssertions: [],
          },
        ],
        gaps: ['Need rubric coverage', 'Need refusal coverage'],
      }),
      { onFillGaps },
    );

    expect(screen.getByText('Fair')).toBeInTheDocument();
    expect(screen.getByText('... and 1 more')).toBeInTheDocument();
    expect(screen.getByText('Gaps to fill:')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Fill gaps/ }));

    expect(onFillGaps).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0.95, 'Excellent'],
    [0.65, 'Good'],
    [0.2, 'Low'],
  ])('labels a %.2f coverage score as %s', (overallScore, label) => {
    renderPanel(createCoverage({ overallScore, requirements: [], gaps: [] }));

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
