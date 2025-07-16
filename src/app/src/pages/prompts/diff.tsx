import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import type { ManagedPromptWithVersions } from '@promptfoo/types/prompt-management';

const DiffContainer = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: theme.spacing(2),
  height: 'calc(100vh - 300px)',
}));

const DiffPane = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  overflow: 'auto',
  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
  fontSize: '14px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
}));

export default function PromptDiffPage() {
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [prompt, setPrompt] = useState<ManagedPromptWithVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionA, setVersionA] = useState<number | null>(null);
  const [versionB, setVersionB] = useState<number | null>(null);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      const response = await callApi(`/managed-prompts/${promptId}`);
      const data = await response.json();
      setPrompt(data);

      // Set default versions
      if (data.versions.length >= 2) {
        setVersionA(data.versions[data.versions.length - 2].version);
        setVersionB(data.versions[data.versions.length - 1].version);
      } else if (data.versions.length === 1) {
        setVersionA(data.versions[0].version);
        setVersionB(data.versions[0].version);
      }
    } catch (error) {
      showToast('Failed to load prompt', 'error');
      console.error('Error loading prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (promptId) {
      loadPrompt();
    }
  }, [promptId]);

  if (loading) {
    return <Box sx={{ p: 3 }}>Loading...</Box>;
  }

  if (!prompt || !versionA || !versionB) {
    return <Box sx={{ p: 3 }}>Prompt not found or insufficient versions</Box>;
  }

  const versionDataA = prompt.versions.find((v) => v.version === versionA);
  const versionDataB = prompt.versions.find((v) => v.version === versionB);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={() => navigate(`/prompts/${promptId}/history`)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">{prompt.name} - Compare Versions</Typography>
        </Stack>

        <Stack direction="row" spacing={2}>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Version A</InputLabel>
            <Select
              value={versionA}
              onChange={(e) => setVersionA(Number(e.target.value))}
              label="Version A"
            >
              {prompt.versions.map((version) => (
                <MenuItem key={version.version} value={version.version}>
                  v{version.version}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="h6" sx={{ alignSelf: 'center' }}>
            vs
          </Typography>

          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Version B</InputLabel>
            <Select
              value={versionB}
              onChange={(e) => setVersionB(Number(e.target.value))}
              label="Version B"
            >
              {prompt.versions.map((version) => (
                <MenuItem key={version.version} value={version.version}>
                  v{version.version}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      <DiffContainer>
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Version {versionA}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {versionDataA
              ? `${new Date(versionDataA.createdAt).toLocaleString()} by ${versionDataA.author}`
              : ''}
          </Typography>
          <DiffPane>{versionDataA?.content || ''}</DiffPane>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Version {versionB}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {versionDataB
              ? `${new Date(versionDataB.createdAt).toLocaleString()} by ${versionDataB.author}`
              : ''}
          </Typography>
          <DiffPane>{versionDataB?.content || ''}</DiffPane>
        </Box>
      </DiffContainer>
    </Box>
  );
}
