import { useState } from 'react';

import { Folder as FolderIcon, InsertDriveFile as FileIcon } from '@mui/icons-material';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ScanStatistics from './ScanStatistics';
import SecurityFindings from './SecurityFindings';
import { getIssueFilePath } from '../utils';

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

      {/* Scanned Files Section */}
      {scanResults.scannedFilesList && scanResults.scannedFilesList.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Scanned Files ({scanResults.scannedFilesList.length})
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
            {scanResults.scannedFilesList.map((file, index) => {
              // Count issues for this file
              const fileIssues = scanResults.issues.filter((issue) => {
                const issueFile = getIssueFilePath(issue);
                return issueFile !== 'Unknown' && issueFile.startsWith(file);
              });
              const criticalCount = fileIssues.filter((i) => i.severity === 'error').length;
              const warningCount = fileIssues.filter((i) => i.severity === 'warning').length;
              const infoCount = fileIssues.filter((i) => i.severity === 'info').length;

              const isDirectory = file.endsWith('/');
              const fileName = file.split('/').pop() || file;

              return (
                <ListItem key={index} sx={{ py: 0.5 }}>
                  <ListItemIcon>
                    {isDirectory ? (
                      <FolderIcon fontSize="small" color="action" />
                    ) : (
                      <FileIcon fontSize="small" color="action" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" component="span">
                          {fileName}
                        </Typography>
                        {fileIssues.length > 0 && (
                          <Stack direction="row" spacing={0.5}>
                            {criticalCount > 0 && (
                              <Chip
                                size="small"
                                label={`${criticalCount} critical`}
                                color="error"
                                sx={{ height: 20 }}
                              />
                            )}
                            {warningCount > 0 && (
                              <Chip
                                size="small"
                                label={`${warningCount} warning${warningCount > 1 ? 's' : ''}`}
                                color="warning"
                                sx={{ height: 20 }}
                              />
                            )}
                            {infoCount > 0 && (
                              <Chip
                                size="small"
                                label={`${infoCount} info`}
                                color="info"
                                sx={{ height: 20 }}
                              />
                            )}
                          </Stack>
                        )}
                      </Stack>
                    }
                    secondary={
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                      >
                        {file}
                      </Typography>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Paper>
      )}

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
