import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsChartsSection } from './ResultsView';

describe('ResultsChartsSection', () => {
  it('keeps children visible while hiding chart controls for redteam evals', () => {
    render(
      <ResultsChartsSection
        canRenderResultsCharts
        isRedteamEval
        resultsChartsScores={[0.2, 0.8]}
        resultsChartsUnavailableReasons={[]}
      >
        {(chartsToggleButton) => (
          <>
            <div>Results toolbar</div>
            {chartsToggleButton}
          </>
        )}
      </ResultsChartsSection>,
    );

    expect(screen.getByText('Results toolbar')).toBeInTheDocument();
    expect(screen.queryByText('Show Charts')).toBeNull();
    expect(screen.queryByText('Hide Charts')).toBeNull();
  });
});
