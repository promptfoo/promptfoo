import React, { useState } from 'react';
import {
  Clear as ClearIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
  Folder as FolderIcon,
  CloudUpload as CloudUploadIcon,
  Business as BusinessIcon,
  Storage as StorageIcon,
  GitHub as GitHubIcon,
  Lock as LockIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
  Paper,
  Grid,
  Tooltip,
} from '@mui/material';
import type { ScanPath } from '../ModelAudit.types';
import { useModelAuditStore } from '../store';

interface PathSelectorProps {
  paths: ScanPath[];
  onAddPath: (path: ScanPath) => void;
  onRemovePath: (index: number) => void;
  currentWorkingDir?: string;
}

export default function PathSelector({
  paths,
  onAddPath,
  onRemovePath,
  currentWorkingDir,
}: PathSelectorProps) {
  const [pathInput, setPathInput] = useState('');
  const { recentScans, clearRecentScans } = useModelAuditStore();

  const handleAddPath = (input: string) => {
    const trimmedPath = input.trim();
    if (!trimmedPath) {
      return;
    }

    const isDirectory = trimmedPath.endsWith('/') || !trimmedPath.includes('.');
    const name = trimmedPath.split('/').pop() || trimmedPath;

    onAddPath({
      path: trimmedPath,
      type: isDirectory ? 'directory' : 'file',
      name,
    });
    setPathInput('');
  };

  return (
    <Box>
      {currentWorkingDir && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>Current directory:</strong> {currentWorkingDir}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Relative paths will be resolved from this directory
          </Typography>
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="Add model path"
          placeholder="Examples: ./model.pkl, /path/to/models/, ../data/model.h5"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleAddPath(pathInput);
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Button onClick={() => handleAddPath(pathInput)} disabled={!pathInput.trim()}>
                  Add
                </Button>
              </InputAdornment>
            ),
          }}
          helperText="Enter a file path or directory path. Press Enter or click Add."
        />
      </Box>

      {/* Enterprise Storage Options */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Other Storage Options
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <Tooltip title="S3 bucket integration is available in Promptfoo Enterprise">
              <Paper
                sx={{
                  p: 2,
                  textAlign: 'center',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                  position: 'relative',
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">
                  AWS S3 Buckets
                </Typography>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <LockIcon fontSize="small" color="disabled" />
                </Box>
              </Paper>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Tooltip title="Azure Blob Storage integration is available in Promptfoo Enterprise">
              <Paper
                sx={{
                  p: 2,
                  textAlign: 'center',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                  position: 'relative',
                }}
              >
                <CloudIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">
                  Azure Blob Storage
                </Typography>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <LockIcon fontSize="small" color="disabled" />
                </Box>
              </Paper>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Tooltip title="Google Cloud Storage integration is available in Promptfoo Enterprise">
              <Paper
                sx={{
                  p: 2,
                  textAlign: 'center',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                  position: 'relative',
                }}
              >
                <CloudIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">
                  Google Cloud Storage
                </Typography>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <LockIcon fontSize="small" color="disabled" />
                </Box>
              </Paper>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Tooltip title="Git repository integration is available in Promptfoo Enterprise">
              <Paper
                sx={{
                  p: 2,
                  textAlign: 'center',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                  position: 'relative',
                }}
              >
                <GitHubIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">
                  Git Repositories
                </Typography>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <LockIcon fontSize="small" color="disabled" />
                </Box>
              </Paper>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Tooltip title="MLflow registry integration is available in Promptfoo Enterprise">
              <Paper
                sx={{
                  p: 2,
                  textAlign: 'center',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                  position: 'relative',
                }}
              >
                <StorageIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">
                  Model Registries
                </Typography>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <LockIcon fontSize="small" color="disabled" />
                </Box>
              </Paper>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Tooltip title="Network file share integration is available in Promptfoo Enterprise">
              <Paper
                sx={{
                  p: 2,
                  textAlign: 'center',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                  position: 'relative',
                }}
              >
                <BusinessIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">
                  Network Shares
                </Typography>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <LockIcon fontSize="small" color="disabled" />
                </Box>
              </Paper>
            </Tooltip>
          </Grid>
        </Grid>
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            <LockIcon fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            Enterprise features enable scanning models from cloud storage, repositories, and
            registries.{' '}
            <a
              href="https://promptfoo.dev/docs/guides/enterprise"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit' }}
            >
              Learn more
            </a>
          </Typography>
        </Box>
      </Box>

      {recentScans.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Recent:</strong>
            </Typography>
            {recentScans.length > 3 && (
              <IconButton
                size="small"
                onClick={clearRecentScans}
                title="Clear recent scans"
                sx={{ p: 0.5 }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {recentScans
              .flatMap((scan) => scan.paths)
              .filter((path, index, self) => index === self.findIndex((p) => p.path === path.path))
              .slice(0, 8)
              .map((path, index) => (
                <Chip
                  key={`${path.path}-${index}`}
                  label={path.path}
                  size="small"
                  onClick={() => handleAddPath(path.path)}
                  sx={{ cursor: 'pointer' }}
                  icon={path.type === 'directory' ? <FolderIcon /> : <FileIcon />}
                />
              ))}
          </Stack>
        </Box>
      )}

      {paths.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 4, mb: 2 }} fontWeight={600}>
            Selected Items ({paths.length})
          </Typography>
          <List>
            {paths.map((path, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton edge="end" onClick={() => onRemovePath(index)}>
                    <DeleteIcon />
                  </IconButton>
                }
                sx={{
                  bgcolor: 'grey.50',
                  borderRadius: 2,
                  mb: 1,
                }}
              >
                <ListItemIcon>
                  {path.type === 'directory' ? (
                    <FolderIcon color="primary" />
                  ) : (
                    <FileIcon color="action" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={path.name || path.path}
                  secondary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        {path.type === 'directory' ? 'Directory' : 'File'}
                      </Typography>
                    </Stack>
                  }
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Box>
  );
}
