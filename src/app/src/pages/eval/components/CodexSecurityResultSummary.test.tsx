import { mockClipboard, restoreBrowserMocks } from '@app/tests/browserMocks';
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
  it('shows this scan rather than historical findings, coverage, versions, and cost bounds', () => {
    render(
      <CodexSecurityResultSummary
        provider="standard-comparison"
        metadata={{
          providerType: 'codex-security',
          operation: 'security-scan',
          sdkVersion: 'fixture-sdk',
          pluginVersion: 'fixture-plugin',
        }}
        output={JSON.stringify({
          coverage: { completeness: 'complete' },
          findings: { findings: [{ severity: { level: 'high' } }, { severity: { level: 'low' } }] },
          repositoryFindings: [{ severity: { level: 'critical' } }],
          cost: { estimatedUsd: 0.1, estimatedUsdRange: { min: 0.1, max: 0.25 } },
        })}
      />,
    );

    expect(screen.getByText('Coverage: Complete')).toBeInTheDocument();
    expect(screen.getByText('Current findings: 2')).toBeInTheDocument();
    const severities = screen.getByRole('list', { name: 'Current findings by severity' });
    expect(within(severities).getByText('critical: 0')).toBeInTheDocument();
    expect(within(severities).getByText('high: 1')).toBeInTheDocument();
    expect(within(severities).getByText('low: 1')).toBeInTheDocument();
    expect(screen.getByText('Baseline: $0.10')).toBeInTheDocument();
    expect(screen.getByText('Range: $0.10–$0.25')).toBeInTheDocument();
    expect(screen.getByText('SDK: fixture-sdk · Plugin: fixture-plugin')).toBeInTheDocument();
  });

  it('preserves metadata-only error context and distinguishes unknown values from zero', () => {
    render(
      <CodexSecurityResultSummary
        provider="custom label"
        output="Operation interrupted"
        metadata={{
          providerType: 'codex-security',
          operation: 'deep-security-scan',
          status: 'error',
          coverage: { completeness: 'partial' },
          warnings: ['One review is unfinished.', null, { text: 'bad shape' }],
          cost: { estimatedUsd: 0.1, estimatedUsdRange: { min: 0.1, max: null } },
          scanDir: '/tmp/fixture-results',
        }}
      />,
    );

    expect(screen.getByText('Deep security scan · Status: error')).toBeInTheDocument();
    expect(screen.getByText('Coverage: Partial')).toBeInTheDocument();
    expect(screen.getByText('Current findings: Unknown')).toBeInTheDocument();
    expect(screen.getByText('Severity counts unavailable.')).toBeInTheDocument();
    expect(screen.getByText('One review is unfinished.')).toBeInTheDocument();
    expect(screen.getByText('Range: $0.10 minimum; upper estimate unknown')).toBeInTheDocument();
    expect(screen.getByText('/tmp/fixture-results')).toBeInTheDocument();
  });

  it('identifies legacy labeled validation responses without presenting scan coverage', () => {
    render(
      <CodexSecurityResultSummary
        provider="validation comparison"
        metadata={{ operation: 'validation', sdkVersion: 'fixture-sdk' }}
        output={JSON.stringify({
          disposition: 'not_applicable',
          outputDir: '/tmp/validation-fixture',
        })}
      />,
    );

    expect(screen.getByText('Validation disposition: Not applicable')).toBeInTheDocument();
    expect(screen.queryByText(/Coverage:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current findings:/)).not.toBeInTheDocument();
    expect(screen.getByText('Baseline: Unknown')).toBeInTheDocument();
    expect(screen.getByText('Range: Unknown')).toBeInTheDocument();
  });

  it.each([undefined, '{invalid', 'null', '[]', '42', { findings: { findings: 'invalid' } }])(
    'tolerates malformed or absent output %j without inferring a clean scan',
    (output) => {
      render(
        <CodexSecurityResultSummary
          provider="openai:codex-security:fixture-model"
          output={output}
        />,
      );
      expect(screen.getByText('Coverage: Unknown')).toBeInTheDocument();
      expect(screen.getByText('Current findings: Unknown')).toBeInTheDocument();
      expect(screen.getByText('Baseline: Unknown')).toBeInTheDocument();
    },
  );

  it('does not classify unrelated providers by an operation name or a similar prefix', () => {
    const { container } = render(
      <CodexSecurityResultSummary
        provider="openai:codex-security-other"
        metadata={{ operation: 'validation' }}
        output={JSON.stringify({ disposition: 'reportable' })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders warnings as text and copies artifact paths without links or file access', async () => {
    const user = userEvent.setup();
    const clipboard = mockClipboard();
    const { container } = render(
      <CodexSecurityResultSummary
        provider="openai:codex-security"
        metadata={{ warnings: ['<em>Fixture warning</em>'], reportPath: '/tmp/fixture/report.md' }}
      />,
    );

    expect(screen.getByText('<em>Fixture warning</em>')).toBeInTheDocument();
    expect(container.querySelector('em')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy report path' }));
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith('/tmp/fixture/report.md');
  });

  it('labels native mock results and explicit canned fixtures as synthetic', () => {
    const { rerender } = render(
      <CodexSecurityResultSummary
        provider="openai:codex-security"
        output={{ turn: { mock: true }, findings: { findings: [] } }}
      />,
    );
    expect(
      screen.getByText('Synthetic test data. No security analysis was performed.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Current findings: 0')).toBeInTheDocument();
    rerender(
      <CodexSecurityResultSummary metadata={{ providerType: 'codex-security', synthetic: true }} />,
    );
    expect(
      screen.getByText('Synthetic test data. No security analysis was performed.'),
    ).toBeInTheDocument();
  });

  it('uses current metadata cost and treats invalid financial or severity data as unknown', () => {
    render(
      <CodexSecurityResultSummary
        metadata={{
          providerType: 'codex-security',
          cost: { estimatedUsd: Number.NaN, estimatedUsdRange: { min: 0.5, max: 0.1 } },
        }}
        output={{
          findings: { findings: [null, { severity: { level: 'unexpected' } }] },
          cost: { estimatedUsd: 100 },
        }}
      />,
    );
    expect(screen.getByText('Baseline: Unknown')).toBeInTheDocument();
    expect(screen.getByText('Range: $0.50 minimum; upper estimate unknown')).toBeInTheDocument();
    expect(screen.getByText('Current findings: 2')).toBeInTheDocument();
    expect(screen.getByText('unknown: 2')).toBeInTheDocument();
  });
});
