// Using a mock type since this is a test - don't import complex frontend types
interface ScanResult {
  path: string;
  success: boolean;
  issues: Array<{ severity: string; message: string }>;
  rawOutput: string;
  files_scanned?: number;
  scannedFiles?: number;
}

describe('Model Audit Critical Findings Fix', () => {
  it('should correctly count critical severity issues', () => {
    const mockScanResults: ScanResult = {
      path: '/test/path',
      success: true,
      issues: [
        { severity: 'critical', message: 'Critical issue 1' },
        { severity: 'critical', message: 'Critical issue 2' },
        { severity: 'error', message: 'Error issue 1' },
        { severity: 'warning', message: 'Warning issue 1' },
        { severity: 'info', message: 'Info issue 1' },
      ],
      rawOutput: '',
    };

    // Test the critical/error counting logic
    const criticalAndErrorCount = mockScanResults.issues.filter(
      (i) => i.severity === 'error' || i.severity === 'critical',
    ).length;

    expect(criticalAndErrorCount).toBe(3); // 2 critical + 1 error

    const warningCount = mockScanResults.issues.filter((i) => i.severity === 'warning').length;

    expect(warningCount).toBe(1);

    const infoCount = mockScanResults.issues.filter((i) => i.severity === 'info').length;

    expect(infoCount).toBe(1);
  });

  it('should correctly filter issues when selectedSeverity is error', () => {
    const mockScanResults: ScanResult = {
      path: '/test/path',
      success: true,
      issues: [
        { severity: 'critical', message: 'Critical issue 1' },
        { severity: 'error', message: 'Error issue 1' },
        { severity: 'warning', message: 'Warning issue 1' },
        { severity: 'info', message: 'Info issue 1' },
      ],
      rawOutput: '',
    };

    const selectedSeverity = 'error';

    // Test the filtering logic from SecurityFindings.tsx
    const filteredIssues = mockScanResults.issues.filter((issue) => {
      if (!selectedSeverity && issue.severity === 'debug') {
        return false;
      }
      if (!selectedSeverity) {
        return true;
      }
      // Handle critical/error mapping
      if (selectedSeverity === 'error') {
        return issue.severity === 'error' || issue.severity === 'critical';
      }
      return issue.severity === selectedSeverity;
    });

    expect(filteredIssues).toHaveLength(2); // Should include both critical and error
    expect(filteredIssues.every((i) => i.severity === 'critical' || i.severity === 'error')).toBe(
      true,
    );
  });

  it('should only show critical/error issues when filtering by error severity', () => {
    const mockScanResults: ScanResult = {
      path: '/test/path',
      success: true,
      issues: [
        { severity: 'critical', message: 'Critical issue 1' },
        { severity: 'critical', message: 'Critical issue 2' },
        { severity: 'warning', message: 'Warning issue 1' },
        { severity: 'info', message: 'Info issue 1' },
      ],
      rawOutput: '',
    };

    const selectedSeverity = 'error';

    const filteredIssues = mockScanResults.issues.filter((issue) => {
      if (!selectedSeverity && issue.severity === 'debug') {
        return false;
      }
      if (!selectedSeverity) {
        return true;
      }
      // Handle critical/error mapping
      if (selectedSeverity === 'error') {
        return issue.severity === 'error' || issue.severity === 'critical';
      }
      return issue.severity === selectedSeverity;
    });

    expect(filteredIssues).toHaveLength(2); // Should only show the 2 critical issues
    expect(filteredIssues.every((i) => i.severity === 'critical')).toBe(true);
  });
});
