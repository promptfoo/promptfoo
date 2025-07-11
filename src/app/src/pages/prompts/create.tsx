import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import CodeEditor from '@app/components/CodeEditor';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import InputAdornment from '@mui/material/InputAdornment';
import Alert from '@mui/material/Alert';

// Helper function to parse CSV content
const parseCsvContent = async (content: string): Promise<string[]> => {
  // Simple CSV parsing for browser
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = ',';
  
  // Check if it has headers
  const hasHeaders = lines[0]?.toLowerCase().includes('prompt');
  const startIndex = hasHeaders ? 1 : 0;
  
  // Check if it's a simple single-column CSV
  if (!lines.some(line => line.includes(delimiter))) {
    return lines.slice(startIndex);
  }
  
  // Parse as multi-column CSV
  try {
    const prompts: string[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const columns = lines[i].split(delimiter).map(col => col.trim().replace(/^["']|["']$/g, ''));
      if (columns[0]) {
        prompts.push(columns[0]);
      }
    }
    return prompts;
  } catch {
    return lines.slice(startIndex);
  }
};

// Helper function to parse JSON content
const parseJsonContent = (content: string): string | string[] => {
  try {
    const parsed = JSON.parse(content);
    
    // Handle chat format
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role) {
      return JSON.stringify(parsed, null, 2);
    }
    
    // Handle array of prompts
    if (Array.isArray(parsed)) {
      return parsed;
    }
    
    // Handle single prompt object
    if (typeof parsed === 'object' && parsed.prompt) {
      return parsed.prompt;
    }
    
    return content;
  } catch {
    return content;
  }
};

// Helper function to generate a default prompt ID
const generateDefaultPromptId = () => {
  const now = new Date();
  // Format: prompt-YYYY-MM-DD-HHMMSS
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `prompt-${year}-${month}-${day}-${hours}${minutes}${seconds}`;
};

// Helper function to extract variables from prompt template
const extractVariables = (template: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables = new Set<string>();
  let match;
  while ((match = regex.exec(template)) !== null) {
    const varName = match[1].trim();
    // Filter out special variables
    if (!varName.startsWith('_')) {
      variables.add(varName);
    }
  }
  return Array.from(variables);
};

export default function PromptCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [promptId, setPromptId] = useState(generateDefaultPromptId());
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  
  // Extract variables from content
  const detectedVariables = useMemo(() => {
    return extractVariables(content);
  }, [content]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {return;}

    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileContent = e.target?.result as string;
      const fileName = file.name.toLowerCase();
      
      try {
        let processedContent = fileContent;
        let detectedType = 'text';
        
        // Process based on file type
        if (fileName.endsWith('.json') || fileName.endsWith('.jsonl')) {
          const result = parseJsonContent(fileContent);
          if (Array.isArray(result)) {
            showToast(`Loaded ${result.length} prompts from JSON. Showing first prompt.`, 'info');
            processedContent = result[0];
          } else {
            processedContent = result;
          }
          detectedType = 'json';
        } else if (fileName.endsWith('.csv')) {
          const prompts = await parseCsvContent(fileContent);
          showToast(`Loaded ${prompts.length} prompts from CSV. Showing first prompt.`, 'info');
          processedContent = prompts[0] || '';
          detectedType = 'csv';
        } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
          // For YAML files, we'll treat them as text for now
          // In a real implementation, we'd parse YAML properly
          detectedType = 'yaml';
        } else if (fileName.endsWith('.j2')) {
          detectedType = 'jinja2';
        } else if (fileName.endsWith('.md')) {
          detectedType = 'markdown';
        } else if (fileName.endsWith('.js') || fileName.endsWith('.mjs') || fileName.endsWith('.ts')) {
          detectedType = 'javascript';
          showToast('JavaScript/TypeScript files should export a function. Content loaded as reference.', 'info');
        } else if (fileName.endsWith('.py')) {
          detectedType = 'python';
          showToast('Python files should contain a function. Content loaded as reference.', 'info');
        }
        
        setContent(processedContent);
        setUploadedFileName(file.name);
        setFileType(detectedType);
        
        // Auto-populate prompt ID from filename if it's still the default
        if (promptId.startsWith('prompt-') && /prompt-\d{4}-\d{2}-\d{2}-\d{6}/.test(promptId)) {
          const baseFileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
          setPromptId(baseFileName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase());
        }
        
      } catch (error) {
        showToast('Failed to parse file content', 'error');
        console.error('Error parsing file:', error);
      }
    };
    
    reader.onerror = () => {
      showToast('Failed to read file', 'error');
    };
    
    reader.readAsText(file);
  };

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
      const response = await callApi('/managed-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: promptId,
          description,
          content,
          notes: uploadedFileName ? `Initial version from ${uploadedFileName}` : 'Initial version',
          metadata: fileType ? { sourceType: fileType } : undefined,
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
            helperText="A unique identifier for your prompt (auto-generated, but you can change it)"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Generate new ID">
                    <IconButton
                      size="small"
                      onClick={() => setPromptId(generateDefaultPromptId())}
                      edge="end"
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
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
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle1">
                Prompt Content *
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                {uploadedFileName && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      Loaded from:
                    </Typography>
                    <Chip 
                      label={uploadedFileName} 
                      size="small" 
                      onDelete={() => {
                        setUploadedFileName(null);
                        setFileType(null);
                      }}
                    />
                    {fileType && (
                      <Chip 
                        label={fileType} 
                        size="small" 
                        color="primary" 
                        variant="outlined" 
                      />
                    )}
                  </Stack>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.jsonl,.yaml,.yml,.csv,.j2,.js,.mjs,.ts,.py"
                  title="Upload a prompt file"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CloudUploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload File
                </Button>
                <Tooltip 
                  title={
                    <Box sx={{ p: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        Supported formats:
                      </Typography>
                      <Typography variant="body2">
                        • <strong>Text:</strong> .txt, .md
                      </Typography>
                      <Typography variant="body2">
                        • <strong>Templates:</strong> .j2 (Jinja2)
                      </Typography>
                      <Typography variant="body2">
                        • <strong>Structured:</strong> .json, .yaml
                      </Typography>
                      <Typography variant="body2">
                        • <strong>Data:</strong> .csv, .jsonl
                      </Typography>
                      <Typography variant="body2">
                        • <strong>Code:</strong> .js, .ts, .py
                      </Typography>
                    </Box>
                  }
                  placement="bottom-end"
                >
                  <IconButton size="small" sx={{ ml: 0.5 }}>
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
            
            <Box sx={{ height: '400px', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <CodeEditor
                value={content}
                onChange={setContent}
                language="markdown"
                placeholder="Enter your prompt template here. Use {{variable}} for dynamic values."
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Tip: Use {'{{variables}}'} for dynamic values in your prompts
            </Typography>
          </Box>
          
          {/* Variable Detection */}
          {detectedVariables.length > 0 && (
            <Alert severity="info" icon={<InfoOutlinedIcon />}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">
                  Detected {detectedVariables.length} variable{detectedVariables.length > 1 ? 's' : ''}:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {detectedVariables.map((variable) => (
                    <Chip
                      key={variable}
                      label={`{{${variable}}}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  These variables will need values when testing or using this prompt
                </Typography>
              </Stack>
            </Alert>
          )}
        </Stack>
      </Paper>
    </Box>
  );
} 