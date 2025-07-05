import React, { useState } from 'react';
import { callApi } from '@app/utils/api';
import {
  Clear as ClearIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
  Folder as FolderIcon,
  CloudUpload as CloudUploadIcon,
  Storage as StorageIcon,
  GitHub as GitHubIcon,
  Lock as LockIcon,
  Cloud as CloudIcon,
  Computer as ComputerIcon,
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
  Tabs,
  Tab,
  Badge,
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
  const [activeTab, setActiveTab] = useState(0);
  const { recentScans, clearRecentScans } = useModelAuditStore();

  const handleAddPath = async (input: string) => {
    const trimmedPath = input.trim();
    if (!trimmedPath) {
      return;
    }

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
          name: data.name || trimmedPath.split('/').pop() || trimmedPath,
        });
      } else {
        // Path doesn't exist, make a best guess based on the input
        // If it ends with a slash, treat as directory
        const isDirectory = trimmedPath.endsWith('/');
        const name = trimmedPath.split('/').pop() || trimmedPath;

        onAddPath({
          path: trimmedPath,
          type: isDirectory ? 'directory' : 'file',
          name,
        });
      }
    } catch (error) {
      console.error('Error checking path:', error);
      // Fallback to simple logic if API call fails
      const isDirectory = trimmedPath.endsWith('/');
      const name = trimmedPath.split('/').pop() || trimmedPath;

      onAddPath({
        path: trimmedPath,
        type: isDirectory ? 'directory' : 'file',
        name,
      });
    }

    setPathInput('');
  };

  const tabIcon = (icon: React.ReactElement, isLocked: boolean = false) => {
    if (isLocked) {
      return (
        <Badge
          badgeContent={<LockIcon sx={{ fontSize: 10 }} />}
          sx={{
            '& .MuiBadge-badge': {
              right: -3,
              top: 3,
              padding: 0,
              minWidth: 12,
              height: 12,
            },
          }}
        >
          {icon}
        </Badge>
      );
    }
    return icon;
  };

  return (
    <Box>
      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
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
        <Tooltip title="Git repository integration is available in Promptfoo Enterprise">
          <span>
            <Tab
              label="Git Repositories"
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

          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label="Add model path"
              placeholder="Examples: ./model.pkl, /path/to/models/, ../data/model.h5"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
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
              <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
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
              <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
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
              <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
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
