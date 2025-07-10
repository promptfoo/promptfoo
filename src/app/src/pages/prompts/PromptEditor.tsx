import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import CodeEditor from '@app/components/CodeEditor';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DeployIcon from '@mui/icons-material/CloudUpload';
import HistoryIcon from '@mui/icons-material/History';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import type { 
  ManagedPromptWithVersions, 
  PromptVersion 
} from '@promptfoo/types/prompt-management';

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  height: '100%',
}));

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function PromptEditor() {
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [prompt, setPrompt] = useState<ManagedPromptWithVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deployEnvironment, setDeployEnvironment] = useState('');
  const [deployVersion, setDeployVersion] = useState<number | null>(null);

  useEffect(() => {
    if (promptId) {
      loadPrompt();
    }
  }, [promptId]);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      const response = await callApi(`/prompts/${promptId}`);
      const data = await response.json();
      setPrompt(data);
      
      // Set initial content from latest version
      const latestVersion = data.versions.find((v: PromptVersion) => v.version === data.currentVersion);
      if (latestVersion) {
        setContent(latestVersion.content);
        setSelectedVersion(latestVersion.version);
      }
    } catch (error) {
      showToast('Failed to load prompt', 'error');
      console.error('Error loading prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!prompt || !content.trim()) {
      showToast('Please enter prompt content', 'warning');
      return;
    }

    // Check if content changed
    const currentVersion = prompt.versions.find(v => v.version === selectedVersion);
    if (currentVersion && currentVersion.content === content) {
      showToast('No changes detected', 'info');
      return;
    }

    try {
      setSaving(true);
      const response = await callApi(`/prompts/${promptId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, notes }),
      });

      if (!response.ok) {
        throw new Error('Failed to save prompt');
      }

      showToast('New version saved successfully', 'success');
      setNotes('');
      await loadPrompt();
    } catch (error) {
      showToast('Failed to save prompt', 'error');
      console.error('Error saving prompt:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!deployEnvironment || deployVersion === null) {
      showToast('Please select environment and version', 'warning');
      return;
    }

    try {
      const response = await callApi(`/prompts/${promptId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          environment: deployEnvironment, 
          version: deployVersion 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to deploy prompt');
      }

      showToast(`Deployed version ${deployVersion} to ${deployEnvironment}`, 'success');
      setDeployDialogOpen(false);
      setDeployEnvironment('');
      setDeployVersion(null);
      await loadPrompt();
    } catch (error) {
      showToast('Failed to deploy prompt', 'error');
      console.error('Error deploying prompt:', error);
    }
  };

  const handleVersionChange = (version: number) => {
    const versionData = prompt?.versions.find(v => v.version === version);
    if (versionData) {
      setContent(versionData.content);
      setSelectedVersion(version);
    }
  };

  if (loading) {
    return <Box>Loading...</Box>;
  }

  if (!prompt) {
    return <Box>Prompt not found</Box>;
  }

  return (
    <Box sx={{ height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={() => navigate('/prompts')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">{prompt.name}</Typography>
          <Chip label={`v${prompt.currentVersion}`} color="primary" />
        </Stack>
        <Stack direction="row" spacing={2}>
          <Button
            startIcon={<HistoryIcon />}
            onClick={() => navigate(`/prompts/${promptId}/history`)}
          >
            History
          </Button>
          <Button
            startIcon={<CompareArrowsIcon />}
            onClick={() => navigate(`/prompts/${promptId}/diff`)}
          >
            Compare
          </Button>
          <Button
            variant="outlined"
            startIcon={<DeployIcon />}
            onClick={() => setDeployDialogOpen(true)}
          >
            Deploy
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            Save New Version
          </Button>
        </Stack>
      </Stack>

      {prompt.description && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {prompt.description}
        </Typography>
      )}

      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Editor" />
        <Tab label="Metadata" />
        <Tab label="Deployments" />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <Stack spacing={2}>
          <FormControl>
            <InputLabel>Version</InputLabel>
            <Select
              value={selectedVersion || ''}
              onChange={(e) => handleVersionChange(Number(e.target.value))}
              label="Version"
            >
              {prompt.versions.map((version) => (
                <MenuItem key={version.version} value={version.version}>
                  Version {version.version} - {new Date(version.createdAt).toLocaleDateString()}
                  {version.notes && ` - ${version.notes}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ height: '500px' }}>
            <CodeEditor
              value={content}
              onChange={setContent}
              language="markdown"
            />
          </Box>

          <TextField
            label="Version Notes"
            placeholder="Describe the changes in this version..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
          />
        </Stack>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <StyledPaper>
          <Stack spacing={2}>
            <Typography variant="h6">Prompt Information</Typography>
            <Box>
              <Typography variant="body2" color="text.secondary">ID</Typography>
              <Typography>{prompt.id}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Name</Typography>
              <Typography>{prompt.name}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Created</Typography>
              <Typography>{new Date(prompt.createdAt).toLocaleString()}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Last Updated</Typography>
              <Typography>{new Date(prompt.updatedAt).toLocaleString()}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Author</Typography>
              <Typography>{prompt.author || 'Unknown'}</Typography>
            </Box>
            {prompt.tags && prompt.tags.length > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary">Tags</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {prompt.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </StyledPaper>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <StyledPaper>
          <Stack spacing={3}>
            <Typography variant="h6">Deployment Status</Typography>
            {Object.entries(prompt.deployments || {}).length === 0 ? (
              <Typography color="text.secondary">No deployments configured</Typography>
            ) : (
              Object.entries(prompt.deployments).map(([env, version]) => (
                <Box key={env}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Chip label={env} variant="outlined" />
                    <Typography>Version {version}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {new Date().toLocaleDateString()}
                    </Typography>
                  </Stack>
                </Box>
              ))
            )}
          </Stack>
        </StyledPaper>
      </TabPanel>

      <Dialog open={deployDialogOpen} onClose={() => setDeployDialogOpen(false)}>
        <DialogTitle>Deploy Prompt</DialogTitle>
        <DialogContent sx={{ minWidth: 400 }}>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <TextField
              label="Environment"
              placeholder="e.g., production, staging, development"
              value={deployEnvironment}
              onChange={(e) => setDeployEnvironment(e.target.value)}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Version</InputLabel>
              <Select
                value={deployVersion || ''}
                onChange={(e) => setDeployVersion(Number(e.target.value))}
                label="Version"
              >
                {prompt.versions.map((version) => (
                  <MenuItem key={version.version} value={version.version}>
                    Version {version.version}
                    {version.version === prompt.currentVersion && ' (latest)'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeploy} variant="contained">Deploy</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 