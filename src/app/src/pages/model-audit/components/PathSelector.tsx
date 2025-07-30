import React, { useState, useCallback } from 'react';

import { callApi } from '@app/utils/api';
import {
  Clear as ClearIcon,
  Cloud as CloudIcon,
  CloudUpload as CloudUploadIcon,
  Computer as ComputerIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  GitHub as GitHubIcon,
  Lock as LockIcon,
  Storage as StorageIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useModelAuditStore } from '../store';

import type { ScanPath } from '../ModelAudit.types';

interface PathSelectorProps {
  paths: ScanPath[];
  onAddPath: (path: ScanPath) => void;
  onRemovePath: (index: number) => void;
  currentWorkingDir?: string;
}

// File input functionality removed to avoid browser security warnings
// Using drag-drop and manual path input instead

const SUPPORTED_FILE_TYPES = {
  PyTorch: ['.pt', '.pth', '.bin'],
  TensorFlow: ['.pb', '.h5', '.keras', '.tflite'],
  ONNX: ['.onnx'],
  Pickle: ['.pkl'],
  SafeTensors: ['.safetensors'],
  Checkpoint: ['.ckpt'],
};

// Helper function to extract name from path, handling trailing slashes
const extractNameFromPath = (path: string): string => {
  // Remove trailing slash if present
  const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const parts = normalizedPath.split('/');
  return parts[parts.length - 1] || normalizedPath;
};

export default function PathSelector({
  paths,
  onAddPath,
  onRemovePath,
  currentWorkingDir,
}: PathSelectorProps) {
  const theme = useTheme();
  const [pathInput, setPathInput] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { recentScans, clearRecentScans } = useModelAuditStore();

  // Removed file input refs - using only drag-drop and manual input

  const handleAddPath = async (input: string) => {
    const trimmedPath = input.trim();
    if (!trimmedPath) {
      return;
    }

    // Check if path already exists
    if (paths.some((p) => p.path === trimmedPath)) {
      setError('Path already added');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      // Check path type using the API
      const response = await callApi('/model-audit/check-path', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: trimmedPath }),
      });

      const data = await response.json();

      if (data.exists) {
        // Use the actual type from the filesystem
        onAddPath({
          path: trimmedPath,
          type: data.type,
          name: data.name || extractNameFromPath(trimmedPath),
        });
        setPathInput('');
      } else {
        // Path doesn't exist but we'll still add it with a warning
        setError('Path does not exist or is not accessible');

        // Make a best guess based on the input
        const isDirectory = trimmedPath.endsWith('/');
        onAddPath({
          path: trimmedPath,
          type: isDirectory ? 'directory' : 'file',
          name: extractNameFromPath(trimmedPath),
        });
        setPathInput('');
        setTimeout(() => setError(null), 5000);
      }
    } catch (_error) {
      setError('Failed to check path. The path will be added anyway.');

      // Add the path anyway with a best guess
      const isDirectory = trimmedPath.endsWith('/');
      onAddPath({
        path: trimmedPath,
        type: isDirectory ? 'directory' : 'file',
        name: extractNameFromPath(trimmedPath),
      });
      setPathInput('');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsChecking(false);
    }
  };

  // File selection removed - using only drag-drop and manual path input
  // This avoids browser security warnings about "uploading" files

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const items = Array.from(e.dataTransfer.items);

      items.forEach((item) => {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            // Handle both files and directories
            if (entry.isDirectory) {
              handleAddPath(entry.fullPath + '/');
            } else {
              handleAddPath(entry.fullPath);
            }
          }
        }
      });
    },
    [paths],
  );

  const tabIcon = (icon: React.ReactElement, isEnterprise = false): React.ReactElement => {
    if (isEnterprise) {
      return (
        <Badge
          badgeContent={
            <Tooltip title="Enterprise Feature">
              <LockIcon sx={{ fontSize: 12 }} />
            </Tooltip>
          }
          sx={{
            '& .MuiBadge-badge': {
              right: -4,
              top: 4,
              backgroundColor: 'transparent',
              color: 'text.disabled',
            },
          }}
        >
          {icon}
        </Badge>
      );
    }
    return icon;
  };

  const getFileTypeChip = (filename: string) => {
    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

    for (const [type, extensions] of Object.entries(SUPPORTED_FILE_TYPES)) {
      if (extensions.includes(ext)) {
        return (
          <Chip
            label={type}
            size="small"
            sx={{
              ml: 1,
              backgroundColor:
                theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200],
            }}
          />
        );
      }
    }
    return null;
  };

  return (
    <Box>
      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label="Local Files" icon={tabIcon(<ComputerIcon />)} iconPosition="start" />
        <Tooltip title="Cloud storage integration is available in Promptfoo Enterprise">
          <span>
            <Tab
              label="Cloud Storage"
              icon={tabIcon(<CloudIcon />, true)}
              iconPosition="start"
              disabled
              sx={{ opacity: 0.6 }}
            />
          </span>
        </Tooltip>
        <Tooltip title="GitHub integration is available in Promptfoo Enterprise">
          <span>
            <Tab
              label="GitHub"
              icon={tabIcon(<GitHubIcon />, true)}
              iconPosition="start"
              disabled
              sx={{ opacity: 0.6 }}
            />
          </span>
        </Tooltip>
        <Tooltip title="Model registry integration is available in Promptfoo Enterprise">
          <span>
            <Tab
              label="Model Registries"
              icon={tabIcon(<StorageIcon />, true)}
              iconPosition="start"
              disabled
              sx={{ opacity: 0.6 }}
            />
          </span>
        </Tooltip>
      </Tabs>

      {/* Local Files Tab */}
      {activeTab === 0 && (
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

          {/* Drag and Drop Zone */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Add model path
          </Typography>
          <Paper
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
              p: 3,
              mb: 2.5,
              border: '2px dashed',
              borderColor: isDragging ? 'primary.main' : 'divider',
              borderRadius: 2,
              backgroundColor: isDragging
                ? theme.palette.action.hover
                : theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.02)'
                  : 'rgba(0, 0, 0, 0.02)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: isDragging ? 'scale(1.02)' : 'scale(1)',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <UploadIcon
              sx={{
                fontSize: 40,
                color: isDragging ? 'primary.main' : 'text.secondary',
                mb: 1.5,
              }}
            />
            <Typography variant="body1" gutterBottom sx={{ fontWeight: 500 }}>
              Drop files or folders here to add their paths
            </Typography>
            <Typography variant="body2" color="text.secondary">
              or type the path manually below
            </Typography>

            {/* Supported file types */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Supported formats:
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                justifyContent="center"
                sx={{ mt: 1 }}
              >
                {Object.entries(SUPPORTED_FILE_TYPES).map(([type, exts]) => (
                  <Chip
                    key={type}
                    label={`${type} (${exts.join(', ')})`}
                    size="small"
                    variant="outlined"
                    sx={{ m: 0.5 }}
                  />
                ))}
              </Stack>
            </Box>
          </Paper>

          {/* Manual Input Section */}
          <Box sx={{ mb: 3 }}>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <TextField
                fullWidth
                label="Add model path"
                placeholder="Type a path or drag & drop above"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPath(pathInput);
                  }
                }}
                error={!!error}
                helperText={error || 'Enter a file or directory path'}
                disabled={isChecking}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <FolderOpenIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        onClick={() => handleAddPath(pathInput)}
                        disabled={!pathInput.trim() || isChecking}
                        variant="text"
                        sx={{ mr: 1 }}
                      >
                        {isChecking ? 'Checking...' : 'Add'}
                      </Button>
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
          </Box>

          {/* Recent Scans Section */}
          {recentScans.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Recent Paths
                </Typography>
                {recentScans.length > 3 && (
                  <Button
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={clearRecentScans}
                    sx={{ color: 'text.secondary' }}
                  >
                    Clear
                  </Button>
                )}
              </Stack>

              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  backgroundColor:
                    theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.02)'
                      : 'rgba(0, 0, 0, 0.02)',
                }}
              >
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {recentScans
                    .flatMap((scan) => scan.paths)
                    .filter(
                      (path, index, self) => index === self.findIndex((p) => p.path === path.path),
                    )
                    .slice(0, 8)
                    .map((path, index) => (
                      <Chip
                        key={`${path.path}-${index}`}
                        label={path.name || path.path}
                        size="medium"
                        onClick={() => {
                          if (!paths.some((p) => p.path === path.path)) {
                            handleAddPath(path.path);
                          }
                        }}
                        icon={path.type === 'directory' ? <FolderIcon /> : <FileIcon />}
                        variant="outlined"
                        sx={{
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': {
                            backgroundColor: theme.palette.action.hover,
                            transform: 'translateY(-1px)',
                          },
                        }}
                      />
                    ))}
                </Stack>
              </Paper>
            </Box>
          )}
        </Box>
      )}

      {/* Cloud Storage Tab */}
      {activeTab === 1 && (
        <Box sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <CloudIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.disabled" gutterBottom>
              Cloud Storage Integration
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Scan models directly from cloud storage providers with automatic authentication and
              secure access.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper
                sx={{
                  p: 3,
                  textAlign: 'center',
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? theme.palette.grey[800]
                      : theme.palette.grey[50],
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="subtitle1" gutterBottom>
                  AWS S3
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  IAM roles, credentials management
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  <code>s3://bucket/models/</code>
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper
                sx={{
                  p: 3,
                  textAlign: 'center',
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? theme.palette.grey[800]
                      : theme.palette.grey[50],
                }}
              >
                <CloudIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="subtitle1" gutterBottom>
                  Azure Blob
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Managed identity, SAS tokens
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  <code>az://container/path/</code>
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper
                sx={{
                  p: 3,
                  textAlign: 'center',
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? theme.palette.grey[800]
                      : theme.palette.grey[50],
                }}
              >
                <CloudIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="subtitle1" gutterBottom>
                  Google Cloud
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Service accounts, workload identity
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  <code>gs://bucket/models/</code>
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button
              variant="outlined"
              href="https://promptfoo.dev/docs/guides/enterprise"
              target="_blank"
              startIcon={<LockIcon />}
            >
              Available in Enterprise
            </Button>
          </Box>
        </Box>
      )}

      {/* Git Repositories Tab */}
      {activeTab === 2 && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <GitHubIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.disabled" gutterBottom>
            Git Repository Integration
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Scan models directly from GitHub, GitLab, or Bitbucket repositories with OAuth
            integration.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Configure paths like: <code>github:org/repo/path/to/model.pkl</code>
          </Typography>
          <Button
            variant="outlined"
            href="https://promptfoo.dev/docs/guides/enterprise"
            target="_blank"
            startIcon={<LockIcon />}
          >
            Available in Enterprise
          </Button>
        </Box>
      )}

      {/* Model Registries Tab */}
      {activeTab === 3 && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <StorageIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.disabled" gutterBottom>
            Model Registry Integration
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Connect to MLflow, Weights & Biases, Neptune, and other model registries.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Scan models by registry URI: <code>mlflow://model-name/version</code>
          </Typography>
          <Button
            variant="outlined"
            href="https://promptfoo.dev/docs/guides/enterprise"
            target="_blank"
            startIcon={<LockIcon />}
          >
            Available in Enterprise
          </Button>
        </Box>
      )}

      {/* Selected Paths Section */}
      {paths.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
              Selected Paths
              <Chip label={paths.length} size="small" color="primary" sx={{ ml: 1, height: 20 }} />
            </Typography>
          </Stack>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              backgroundColor:
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            }}
          >
            <Stack spacing={1.5}>
              {paths.map((path, index) => (
                <Paper
                  key={index}
                  elevation={0}
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      transform: 'translateX(4px)',
                      '& .delete-button': {
                        opacity: 1,
                      },
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    {path.type === 'directory' ? (
                      <FolderIcon
                        sx={{
                          mr: 2,
                          color: theme.palette.primary.main,
                          fontSize: 28,
                        }}
                      />
                    ) : (
                      <FileIcon
                        sx={{
                          mr: 2,
                          color: theme.palette.text.secondary,
                          fontSize: 28,
                        }}
                      />
                    )}

                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {path.name || extractNameFromPath(path.path)}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {path.path}
                        </Typography>
                        {path.type === 'file' && getFileTypeChip(path.path)}
                      </Stack>
                    </Box>
                  </Box>

                  <IconButton
                    className="delete-button"
                    edge="end"
                    aria-label={`Remove ${path.name || path.path}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePath(index);
                    }}
                    size="small"
                    sx={{
                      ml: 2,
                      opacity: 0.7,
                      transition: 'opacity 0.2s',
                      color: theme.palette.error.main,
                      '&:hover': {
                        backgroundColor: theme.palette.error.light + '20',
                      },
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
