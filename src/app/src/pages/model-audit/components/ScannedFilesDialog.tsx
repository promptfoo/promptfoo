import FolderIcon from '@mui/icons-material/Folder';
import { InsertDriveFile as FileIcon } from '@mui/icons-material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getIssueFilePath } from '../utils';

import type { ScanPath, ScanResult } from '../ModelAudit.types';

interface ScannedFilesDialogProps {
  open: boolean;
  onClose: () => void;
  scanResults: ScanResult | null;
  paths: ScanPath[];
}

export default function ScannedFilesDialog({
  open,
  onClose,
  scanResults,
  paths,
}: ScannedFilesDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={2}>
          <FileIcon />
          <Typography variant="h5" fontWeight={600}>
            Scanned Files
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {scanResults?.scannedFilesList && scanResults.scannedFilesList.length > 0 ? (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Total: {scanResults.scannedFilesList.length} files scanned
            </Typography>
            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {scanResults.scannedFilesList.map((file, index) => {
                // Count issues for this file
                const fileIssues = (scanResults.issues || []).filter((issue) => {
                  const issueFile = getIssueFilePath(issue);
                  return issueFile !== 'Unknown' && issueFile.startsWith(file);
                });
                const criticalCount = fileIssues.filter((i) => i.severity === 'error').length;
                const warningCount = fileIssues.filter((i) => i.severity === 'warning').length;

                return (
                  <ListItem key={index} sx={{ py: 0.5 }}>
                    <ListItemIcon>
                      <FileIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={file.split('/').pop()}
                      secondary={
                        <Stack component="span" direction="row" spacing={1} alignItems="center">
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ fontFamily: 'monospace' }}
                          >
                            {file}
                          </Typography>
                          {fileIssues.length > 0 && (
                            <Typography component="span" variant="caption" color="text.secondary">
                              • {criticalCount > 0 && `${criticalCount} critical`}
                              {criticalCount > 0 && warningCount > 0 && ', '}
                              {warningCount > 0 && `${warningCount} warnings`}
                            </Typography>
                          )}
                        </Stack>
                      }
                      primaryTypographyProps={{ fontSize: '0.875rem' }}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ) : (
          <Box sx={{ py: 3 }}>
            {scanResults && paths.length > 0 ? (
              <>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  Scanned Paths:
                </Typography>
                <List>
                  {paths.map((path, index) => (
                    <ListItem key={index} sx={{ py: 0.5 }}>
                      <ListItemIcon>
                        {path.type === 'directory' ? (
                          <FolderIcon fontSize="small" />
                        ) : (
                          <FileIcon fontSize="small" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={path.path}
                        secondary={path.type}
                        primaryTypographyProps={{ fontSize: '0.875rem', fontFamily: 'monospace' }}
                        secondaryTypographyProps={{ fontSize: '0.75rem' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            ) : (
              <Typography color="text.secondary" textAlign="center">
                No scan results available
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
