import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { ManagedPromptWithVersions } from '@promptfoo/types/prompt-management';

export default function PromptHistoryPage() {
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [prompt, setPrompt] = useState<ManagedPromptWithVersions | null>(null);
  const [loading, setLoading] = useState(true);

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
    } catch (error) {
      showToast('Failed to load prompt history', 'error');
      console.error('Error loading prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Box sx={{ p: 3 }}>Loading...</Box>;
  }

  if (!prompt) {
    return <Box sx={{ p: 3 }}>Prompt not found</Box>;
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={() => navigate('/prompts')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">{prompt.name} - Version History</Typography>
        </Stack>
        <Button
          startIcon={<CompareArrowsIcon />}
          onClick={() => navigate(`/prompts/${promptId}/diff`)}
        >
          Compare Versions
        </Button>
      </Stack>

      {prompt.description && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {prompt.description}
        </Typography>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Author</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {prompt.versions
              .sort((a, b) => b.version - a.version)
              .map((version) => (
                <TableRow key={version.id} hover>
                  <TableCell>
                    <Typography variant="body1" fontWeight={500}>
                      v{version.version}
                    </Typography>
                  </TableCell>
                  <TableCell>{version.author || 'Unknown'}</TableCell>
                  <TableCell>{new Date(version.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {version.notes || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {version.version === prompt.currentVersion && (
                        <Chip label="Current" size="small" color="primary" />
                      )}
                      {Object.entries(prompt.deployments || {}).map(([env, v]) => 
                        v === version.version && (
                          <Chip key={env} label={env} size="small" variant="outlined" />
                        )
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      onClick={() => navigate(`/prompts/${promptId}/edit?version=${version.version}`)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
} 