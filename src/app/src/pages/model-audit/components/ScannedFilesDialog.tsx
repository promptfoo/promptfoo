import React from 'react';
import { InsertDriveFile as FileIcon, Folder as FolderIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
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
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {scanResults.scannedFilesList.map((file, index) => (
              <ListItem key={index} sx={{ py: 0.5 }}>
                <ListItemIcon>
                  <FileIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={file}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontFamily: 'monospace' }}
                />
              </ListItem>
            ))}
          </List>
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
