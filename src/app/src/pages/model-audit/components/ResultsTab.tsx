import { useState } from 'react';

import Box from '@mui/material/Box';
import ScanStatistics from './ScanStatistics';
import SecurityFindings from './SecurityFindings';

import type { ScanResult } from '../ModelAudit.types';

interface ResultsTabProps {
  scanResults: ScanResult;
  onShowFilesDialog: () => void;
}

export default function ResultsTab({ scanResults, onShowFilesDialog }: ResultsTabProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);

  return (
    <Box>
      <ScanStatistics
        scanResults={scanResults}
        selectedSeverity={selectedSeverity}
        onSeverityClick={setSelectedSeverity}
        onFilesClick={onShowFilesDialog}
      />
      <SecurityFindings
        scanResults={scanResults}
        selectedSeverity={selectedSeverity}
        onSeverityChange={setSelectedSeverity}
        showRawOutput={showRawOutput}
        onToggleRawOutput={() => setShowRawOutput(!showRawOutput)}
      />
    </Box>
  );
}
