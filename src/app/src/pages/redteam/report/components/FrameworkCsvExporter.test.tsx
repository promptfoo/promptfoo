import { mockObjectUrl, restoreBrowserMocks } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CSVExporter from './FrameworkCsvExporter';

import type { CategoryStats } from './FrameworkComplianceUtils';

async function exportRows(categoryStats: CategoryStats): Promise<string[]> {
  renderWithProviders(
    <CSVExporter
      categoryStats={categoryStats}
      pluginPassRateThreshold={0.8}
      frameworksToShow={['mitre:atlas']}
    />,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: /Export framework/ }));

  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split('\n'));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('framework CSV export', () => {
  beforeEach(() => {
    mockObjectUrl('blob:framework-test');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreBrowserMocks();
  });

  it('exports one harmful row with the short alias stats and correct severity', async () => {
    const rows = await exportRows({
      'promptfoo:redteam:harmful:hate': { pass: 0, total: 10, failCount: 10 },
      'harmful:hate': { pass: 10, total: 10, failCount: 0 },
      'unmapped-plugin': { pass: 0, total: 100, failCount: 100 },
    });

    expect(rows.filter((row) => row.includes(',Hate Speech,'))).toEqual([
      'MITRE ATLAS,N/A,Hate Speech,critical,10,0,0.00,Pass',
    ]);
    expect(rows.some((row) => row.includes('unmapped-plugin'))).toBe(false);
    expect(rows.every((row, index) => index === 0 || row.startsWith('MITRE ATLAS,'))).toBe(true);
  });

  it('marks rows without test data as untested', async () => {
    const rows = await exportRows({});

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.slice(1).every((row) => row.endsWith(',0,0,0,Not Tested'))).toBe(true);
  });
});
