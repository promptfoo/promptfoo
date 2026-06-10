import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SemanticFrontierDiagnostics from './SemanticFrontierDiagnostics';
import type { SemanticFrontierDiagnostic } from '@promptfoo/redteam/generation/frontierDiagnostics';

describe('SemanticFrontierDiagnostics', () => {
  it('does not render when no diagnostics are available', () => {
    const { container } = render(<SemanticFrontierDiagnostics diagnostics={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders complete, incomplete, and structurally limited frontier states', () => {
    const diagnostics: SemanticFrontierDiagnostic[] = [
      {
        completeFrontierCount: 1,
        frontierCount: 1,
        pluginId: 'pii:social',
        structurallyDegraded: false,
        unreachableFeatureIds: [],
      },
      {
        completeFrontierCount: 0,
        frontierCount: 1,
        pluginId: 'prompt-extraction',
        structurallyDegraded: false,
        unreachableFeatureIds: [],
      },
      {
        completeFrontierCount: 0,
        frontierCount: 1,
        pluginId: 'sql-injection',
        structurallyDegraded: true,
        unreachableFeatureIds: ['authorizationBypass'],
      },
    ];

    render(<SemanticFrontierDiagnostics diagnostics={diagnostics} />);

    expect(screen.getByText('Semantic Frontier Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('1/1 frontier complete')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getAllByText('No structurally unreachable features')).toHaveLength(2);
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getAllByText('0/1 frontier complete')).toHaveLength(2);
    expect(screen.getByText('Structurally limited')).toBeInTheDocument();
    expect(screen.getByText('Unreachable: authorizationBypass')).toBeInTheDocument();
  });
});
