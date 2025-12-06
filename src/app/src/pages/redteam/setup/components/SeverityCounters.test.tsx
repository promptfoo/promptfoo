import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SeverityCounters from './SeverityCounters';
import type { VulnerabilitySeverityCounts } from '@promptfoo/types';

describe('SeverityCounters', () => {
  const defaultCounts: VulnerabilitySeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  it('should render all severity levels', () => {
    render(<SeverityCounters counts={defaultCounts} />);

    expect(screen.getByText(/Critical: 0/)).toBeInTheDocument();
    expect(screen.getByText(/High: 0/)).toBeInTheDocument();
    expect(screen.getByText(/Medium: 0/)).toBeInTheDocument();
    expect(screen.getByText(/Low: 0/)).toBeInTheDocument();
  });

  it('should display correct counts', () => {
    const counts: VulnerabilitySeverityCounts = {
      critical: 3,
      high: 5,
      medium: 10,
      low: 2,
    };

    render(<SeverityCounters counts={counts} />);

    expect(screen.getByText(/Critical: 3/)).toBeInTheDocument();
    expect(screen.getByText(/High: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Medium: 10/)).toBeInTheDocument();
    expect(screen.getByText(/Low: 2/)).toBeInTheDocument();
  });

  it('should show total count when there are vulnerabilities', () => {
    const counts: VulnerabilitySeverityCounts = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };

    render(<SeverityCounters counts={counts} />);

    expect(screen.getByText(/Total: 10/)).toBeInTheDocument();
  });

  it('should not show total count when all counts are zero', () => {
    render(<SeverityCounters counts={defaultCounts} />);

    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
  });

  it('should render tooltips for each severity', () => {
    render(<SeverityCounters counts={defaultCounts} />);

    // Each severity chip should have an aria-label (tooltip content)
    expect(screen.getByLabelText(/Critical security vulnerabilities/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/High severity issues/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Medium severity issues/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Low severity issues/i)).toBeInTheDocument();
  });
});
