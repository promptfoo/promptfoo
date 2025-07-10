import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import CodeEditor from '@app/components/CodeEditor';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export default function PromptCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [promptId, setPromptId] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!promptId.trim()) {
      showToast('Please enter a prompt ID', 'warning');
      return;
    }
    
    if (!content.trim()) {
      showToast('Please enter prompt content', 'warning');
      return;
    }

    try {
      setSaving(true);
      const response = await callApi('/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: promptId,
          description,
          content,
          notes: 'Initial version',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create prompt');
      }

      showToast('Prompt created successfully', 'success');
      navigate('/prompts');
    } catch (error: any) {
      showToast(error.message || 'Failed to create prompt', 'error');
      console.error('Error creating prompt:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={() => navigate('/prompts')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">Create New Prompt</Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          Create Prompt
        </Button>
      </Stack>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={3}>
          <TextField
            label="Prompt ID"
            placeholder="e.g., customer-support-agent"
            value={promptId}
            onChange={(e) => setPromptId(e.target.value)}
            fullWidth
            required
            helperText="A unique identifier for your prompt"
          />
          
          <TextField
            label="Description"
            placeholder="Describe what this prompt is for..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Prompt Content *
            </Typography>
            <Box sx={{ height: '400px', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <CodeEditor
                value={content}
                onChange={setContent}
                language="markdown"
                placeholder="Enter your prompt template here. Use {{variable}} for dynamic values."
              />
            </Box>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
} 