import { describe, expect, it } from 'vitest';
import {
  auditOperatorReportTransfer,
  renderOperatorReportTransferAuditMarkdown,
} from '../../../scripts/redteam-research/auditOperatorReportTransfer';

describe('auditOperatorReportTransfer', () => {
  it('shows why pii direct is not yet ready for the full operator report template', () => {
    expect(auditOperatorReportTransfer()).toEqual([
      {
        availableAxes: ['leak-ready proxy', 'target-regime breadth', 'realized target yield'],
        missingAxes: [],
        pluginId: 'pii:social',
        reusableSections: ['executive summary', 'frontier', 'per-regime evidence', 'known limitations'],
        transferStatus: 'ready',
      },
      {
        availableAxes: ['semantic sensitive-field frontier'],
        missingAxes: ['target-regime breadth', 'realized target yield'],
        pluginId: 'pii:direct',
        reusableSections: ['executive summary', 'frontier', 'known limitations'],
        transferStatus: 'blocked',
      },
    ]);
  });

  it('renders the transfer gap plainly', () => {
    const markdown = renderOperatorReportTransferAuditMarkdown(auditOperatorReportTransfer());

    expect(markdown).toContain(
      '| pii:direct | semantic sensitive-field frontier | target-regime breadth, realized target yield | executive summary, frontier, known limitations | blocked |',
    );
  });
});
