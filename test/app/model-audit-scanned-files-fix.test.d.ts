interface ScanResult {
    path: string;
    success: boolean;
    issues: Array<{
        severity: string;
        message: string;
    }>;
    rawOutput: string;
    files_scanned?: number;
    scannedFiles?: number;
}
//# sourceMappingURL=model-audit-scanned-files-fix.test.d.ts.map