import { mockClipboard, restoreBrowserMocks } from '@app/tests/browserMocks';
import { createCodexSecurityResult } from '@app/tests/fixtures/codexSecurity';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexSecurityResultSummary } from './CodexSecurityResultSummary';

afterEach(() => {
  cleanup();
  restoreBrowserMocks();
  vi.restoreAllMocks();
});

describe('CodexSecurityResultSummary', () => {
  it('displays normalized findings, coverage and a reported cost range without zero badges', () => {
    render(
      <CodexSecurityResultSummary
        result={createCodexSecurityResult({
          status: 'completed',
          coverage: { completeness: 'partial', mode: 'standard' },
          findings: {
            total: 2,
            bySeverity: { critical: 0, high: 1, medium: 0, low: 1, informational: 0, unknown: 0 },
          },
          cost: { baselineUsd: 0.1, range: { minUsd: 0.1, maxUsd: 0.25 }, pricing: null },
        })}
      />,
    );

    expect(screen.getByText('Standard security scan · Completed')).toBeInTheDocument();
    expect(screen.getByText('Findings').nextElementSibling).toHaveTextContent('2 (1 high, 1 low)');
    expect(screen.getByText('Coverage').nextElementSibling).toHaveTextContent('partial');
    expect(screen.getByText('Estimated cost').nextElementSibling).toHaveTextContent('$0.10–$0.25');
    expect(screen.queryByText(/critical/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Baseline:/)).not.toBeInTheDocument();
  });

  it('keeps missing findings, cost and duration distinct from recorded zero', () => {
    const { rerender } = render(
      <CodexSecurityResultSummary result={createCodexSecurityResult()} />,
    );
    expect(screen.getByText('Findings').nextElementSibling).toHaveTextContent('Unknown');
    expect(screen.getByText('Estimated cost').nextElementSibling).toHaveTextContent('Unknown');
    expect(screen.queryByText('Recorded duration')).not.toBeInTheDocument();
    expect(screen.queryByText('Recorded tokens')).not.toBeInTheDocument();

    rerender(
      <CodexSecurityResultSummary
        result={createCodexSecurityResult({
          findings: {
            total: 0,
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0, informational: 0, unknown: 0 },
          },
          cost: { baselineUsd: 0, range: null, pricing: null },
          elapsedMs: 0,
          usage: { input: 0, output: 0, total: 0, cachedInput: null, cacheWriteInput: null },
        })}
      />,
    );
    expect(screen.getByText('Findings').nextElementSibling).toHaveTextContent(/^0$/);
    expect(screen.getByText('Estimated cost').nextElementSibling).toHaveTextContent('$0.0000');
    expect(screen.getByText('Recorded duration').nextElementSibling).toHaveTextContent('0ms');
    expect(screen.getByText('Recorded tokens').nextElementSibling).toHaveTextContent(/^0$/);
  });

  it('shows validation disposition without scan fields', () => {
    render(
      <CodexSecurityResultSummary
        result={createCodexSecurityResult({
          operation: 'validation',
          validation: { disposition: 'not_applicable' },
        })}
      />,
    );
    expect(screen.getByText('Disposition').nextElementSibling).toHaveTextContent('Not applicable');
    expect(screen.queryByText('Findings')).not.toBeInTheDocument();
    expect(screen.queryByText('Coverage')).not.toBeInTheDocument();
    expect(screen.getByText('Estimated cost').nextElementSibling).toHaveTextContent('Unknown');
  });

  it('does not infer a scan from an unknown operation', () => {
    render(<CodexSecurityResultSummary result={createCodexSecurityResult({ operation: null })} />);
    expect(screen.getByText('Security operation · Status unknown')).toBeInTheDocument();
    expect(screen.queryByText('Findings')).not.toBeInTheDocument();
    expect(screen.queryByText('Disposition')).not.toBeInTheDocument();
  });

  it('retains actual errors, warnings and a reported cost lower bound', () => {
    render(
      <CodexSecurityResultSummary
        result={createCodexSecurityResult({
          operation: 'deep-security-scan',
          status: 'interrupted',
          error: 'Operation interrupted by the caller.',
          warnings: ['One review is unfinished.'],
          cost: { baselineUsd: null, range: { minUsd: 0.1, maxUsd: null }, pricing: null },
        })}
      />,
    );
    expect(screen.getByText('Deep security scan · Interrupted')).toBeInTheDocument();
    expect(screen.getByText('Operation interrupted by the caller.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Warnings' })).getByText('One review is unfinished.'),
    ).toBeInTheDocument();
    expect(screen.getByText('$0.10 minimum; upper estimate unknown')).toBeInTheDocument();
  });

  it('keeps compact results small and marks recorded mock evidence', () => {
    render(
      <CodexSecurityResultSummary
        compact
        result={createCodexSecurityResult({
          source: { kind: 'saved-report', mocked: true, file: '/local/report.json' },
          status: 'failed',
          error: 'The report could not be read.',
          model: 'recorded-model',
          elapsedMs: 125000,
          warnings: ['Recorded warning.'],
          artifacts: [{ kind: 'reportPath', path: '/local/report.md' }],
        })}
      />,
    );
    expect(screen.getByText('recorded-model · Saved report')).toBeInTheDocument();
    expect(screen.getByText('Standard security scan · Failed')).toBeInTheDocument();
    expect(screen.queryByText('The report could not be read.')).not.toBeInTheDocument();
    expect(screen.getByText('This result is marked as mocked.')).toBeInTheDocument();
    expect(screen.getByText('Recorded duration').nextElementSibling).toHaveTextContent('2m 5s');
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.queryByText('Recorded warning.')).not.toBeInTheDocument();
    expect(screen.queryByText('Report details')).not.toBeInTheDocument();
    expect(screen.queryByText('/local/report.md')).not.toBeInTheDocument();
  });

  it('keeps recorded scope, target and pricing provenance in report details', async () => {
    const user = userEvent.setup();
    render(
      <CodexSecurityResultSummary
        result={createCodexSecurityResult({
          operation: null,
          coverage: { completeness: 'partial', mode: 'scoped_path' },
          target: {
            kind: 'repository',
            id: 'recorded-id',
            displayName: '/recorded/repo',
            revision: 'recorded-revision',
            baseRevision: 'recorded-base',
            headRevision: 'recorded-head',
            snapshotDigest: 'recorded-digest',
          },
          scope: {
            includePaths: ['src/auth'],
            excludePaths: [],
            summary: 'Recorded scope',
            limitations: ['Review was limited to selected paths.'],
          },
          cost: {
            baselineUsd: 0.1,
            range: { minUsd: 0.1, maxUsd: 0.2 },
            pricing: {
              source: 'recorded-prices',
              asOf: '2026-09-01',
              serviceTier: 'standard',
              context: 'mixed',
            },
          },
        })}
      />,
    );
    expect(screen.queryByText(/Standard security scan/)).not.toBeInTheDocument();
    await user.click(screen.getByText('Report details'));
    for (const value of [
      'scoped_path',
      'recorded-id',
      'recorded-base',
      'recorded-head',
      'recorded-digest',
      'src/auth',
      'Review was limited to selected paths.',
      'recorded-prices',
      '2026-09-01',
      'mixed',
      'standard',
    ]) {
      expect(screen.getByText(value)).toBeVisible();
    }
    expect(screen.getByText('Excluded paths').nextElementSibling).toHaveTextContent(
      'None reported',
    );
    expect(screen.getByText('Short-context baseline').nextElementSibling).toHaveTextContent(
      '$0.10',
    );
  });

  it('shows recorded provenance in a disclosure and copies host artifact paths as text', async () => {
    const user = userEvent.setup();
    const clipboard = mockClipboard();
    const { container } = render(
      <CodexSecurityResultSummary
        result={createCodexSecurityResult({
          versions: { sdk: 'recorded-sdk', plugin: 'recorded-plugin' },
          warnings: ['<em>Recorded warning</em>'],
          artifacts: [{ kind: 'reportPath', path: '/local/report.md' }],
        })}
      />,
    );
    expect(screen.getByText('<em>Recorded warning</em>')).toBeInTheDocument();
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    await user.click(screen.getByText('Report details'));
    expect(screen.getByText('recorded-sdk')).toBeVisible();
    expect(screen.getByText('recorded-plugin')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy report path' }));
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith('/local/report.md');
  });
});
