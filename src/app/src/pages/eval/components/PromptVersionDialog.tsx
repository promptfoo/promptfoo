import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore as useMainStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import LaunchIcon from '@mui/icons-material/Launch';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { 
  ManagedPromptWithVersions, 
  PromptVersion,
  EvaluateTable 
} from '@promptfoo/types';

interface PromptVersionDialogProps {
  open: boolean;
  onClose: () => void;
  evalConfig: any;
  evalTable: EvaluateTable;
}

interface PromptVersionSelection {
  promptId: string;
  currentVersion: string;
  selectedVersion: string;
  availableVersions: PromptVersion[];
  environments: { name: string; version: number }[];
}

export default function PromptVersionDialog({
  open,
  onClose,
  evalConfig,
  evalTable,
}: PromptVersionDialogProps) {
  const [loading, setLoading] = useState(true);
  const [promptSelections, setPromptSelections] = useState<PromptVersionSelection[]>([]);
  const [rerunning, setRerunning] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setStateFromConfig } = useMainStore();

  useEffect(() => {
    if (open) {
      loadPromptVersions();
    }
  }, [open]);

  const loadPromptVersions = async () => {
    setLoading(true);
    try {
      // Extract managed prompts from the eval
      const managedPromptRefs = evalTable.head.prompts
        .map((prompt, idx) => {
          if (prompt.raw?.startsWith('pf://')) {
            const match = prompt.raw.match(/^pf:\/\/([^:]+)(?::(.+))?$/);
            if (match) {
              return {
                index: idx,
                promptId: match[1],
                versionOrEnv: match[2] || 'current',
              };
            }
          }
          return null;
        })
        .filter(Boolean);

      if (managedPromptRefs.length === 0) {
        showToast('No managed prompts found in this evaluation', 'info');
        onClose();
        return;
      }

      // Fetch version info for each managed prompt
      const selections: PromptVersionSelection[] = [];
      
      for (const ref of managedPromptRefs) {
        try {
          const response = await callApi(`/managed-prompts/${ref.promptId}`);
          if (response.ok) {
            const prompt: ManagedPromptWithVersions = await response.json();
            
            // Determine current version
            let currentVersion = ref.versionOrEnv;
            if (currentVersion === 'current') {
              currentVersion = `v${prompt.currentVersion}`;
            } else if (!/^v?\d+$/.test(currentVersion)) {
              // It's an environment name, find the deployed version
              const deployment = prompt.deployments?.find(d => d.environment === currentVersion);
              if (deployment) {
                currentVersion = `v${deployment.version}`;
              }
            }

            // Get environment deployments
            const environments = (prompt.deployments || []).map(d => ({
              name: d.environment,
              version: d.version,
            }));

            selections.push({
              promptId: ref.promptId,
              currentVersion,
              selectedVersion: currentVersion,
              availableVersions: prompt.versions || [],
              environments,
            });
          }
        } catch (error) {
          console.error(`Failed to load versions for prompt ${ref.promptId}:`, error);
        }
      }

      setPromptSelections(selections);
    } catch (error) {
      showToast('Failed to load prompt versions', 'error');
      console.error('Error loading prompt versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVersionChange = (promptId: string, newVersion: string) => {
    setPromptSelections(prev =>
      prev.map(selection =>
        selection.promptId === promptId
          ? { ...selection, selectedVersion: newVersion }
          : selection
      )
    );
  };

  const handleViewDiff = (promptId: string) => {
    const selection = promptSelections.find(s => s.promptId === promptId);
    if (selection) {
      const v1 = selection.currentVersion.replace(/^v/, '');
      const v2 = selection.selectedVersion.replace(/^v/, '');
      window.open(`/prompts/${promptId}/diff?v1=${v1}&v2=${v2}`, '_blank');
    }
  };

  const handleRerun = async () => {
    setRerunning(true);
    try {
      // Create a new config with updated prompt versions
      const updatedConfig = { ...evalConfig };
      
      // Update prompts array with new versions
      updatedConfig.prompts = evalTable.head.prompts.map((prompt) => {
        if (prompt.raw?.startsWith('pf://')) {
          const match = prompt.raw.match(/^pf:\/\/([^:]+)(?::(.+))?$/);
          if (match) {
            const promptId = match[1];
            const selection = promptSelections.find(s => s.promptId === promptId);
            if (selection && selection.selectedVersion !== selection.currentVersion) {
              // Update to new version
              const versionNum = selection.selectedVersion.replace(/^v/, '');
              return `pf://${promptId}:${versionNum}`;
            }
          }
        }
        return prompt.raw || prompt;
      });

      // Use the eval config store to set the configuration
      setStateFromConfig(updatedConfig);
      
      showToast('Configuration updated. Redirecting to setup...', 'success');
      
      // Navigate to setup page to run the eval
      setTimeout(() => {
        navigate('/setup/');
      }, 500);
      
    } catch (error) {
      showToast('Failed to update configuration', 'error');
      console.error('Error updating config:', error);
    } finally {
      setRerunning(false);
    }
  };

  const hasChanges = promptSelections.some(
    selection => selection.selectedVersion !== selection.currentVersion
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h6">Select Prompt Versions</Typography>
          {hasChanges && (
            <Chip
              label="Changes pending"
              color="primary"
              size="small"
              icon={<CheckCircleIcon />}
            />
          )}
        </Stack>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Prompt ID</TableCell>
                  <TableCell>Current Version</TableCell>
                  <TableCell>New Version</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {promptSelections.map((selection) => (
                  <TableRow key={selection.promptId}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {selection.promptId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={selection.currentVersion}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select
                          value={selection.selectedVersion}
                          onChange={(e) => handleVersionChange(selection.promptId, e.target.value)}
                        >
                          <MenuItem value={`v${selection.availableVersions[0]?.version}`}>
                            <em>Latest (v{selection.availableVersions[0]?.version})</em>
                          </MenuItem>
                          
                          {selection.environments.length > 0 && (
                            <MenuItem disabled>
                              <Typography variant="caption" color="text.secondary">
                                Environments
                              </Typography>
                            </MenuItem>
                          )}
                          {selection.environments.map((env) => (
                            <MenuItem key={env.name} value={`v${env.version}`}>
                              {env.name} (v{env.version})
                            </MenuItem>
                          ))}
                          
                          <MenuItem disabled>
                            <Typography variant="caption" color="text.secondary">
                              All Versions
                            </Typography>
                          </MenuItem>
                          {selection.availableVersions.map((version) => (
                            <MenuItem key={version.version} value={`v${version.version}`}>
                              v{version.version}
                              {version.notes && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ ml: 1 }}
                                >
                                  - {version.notes.substring(0, 30)}...
                                </Typography>
                              )}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Button
                          size="small"
                          startIcon={<CompareArrowsIcon />}
                          onClick={() => handleViewDiff(selection.promptId)}
                          disabled={selection.selectedVersion === selection.currentVersion}
                        >
                          View Diff
                        </Button>
                        <Button
                          size="small"
                          startIcon={<LaunchIcon />}
                          onClick={() => window.open(`/prompts/${selection.promptId}/history`, '_blank')}
                        >
                          History
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        
        {!loading && promptSelections.length > 0 && (
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              Select the versions you want to use for each prompt. You can choose specific versions
              or use environment deployments. Click "View Diff" to see changes between versions.
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleRerun}
          disabled={!hasChanges || rerunning}
          startIcon={rerunning ? <CircularProgress size={16} /> : undefined}
        >
          {rerunning ? 'Updating...' : 'Re-run with Selected Versions'}
        </Button>
      </DialogActions>
    </Dialog>
  );
} 