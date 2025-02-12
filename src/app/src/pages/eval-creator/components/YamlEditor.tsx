import React from 'react';
import { Link } from 'react-router-dom';
import Editor from 'react-simple-code-editor';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import yaml from 'js-yaml';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-yaml';
import './YamlEditor.css';
import 'prismjs/themes/prism.css';

interface YamlEditorProps {
  initialConfig?: any;
  readOnly?: boolean;
  initialYaml?: string;
}

const YamlEditorComponent: React.FC<YamlEditorProps> = ({
  initialConfig,
  readOnly = false,
  initialYaml,
}) => {
  const darkMode = useTheme().palette.mode === 'dark';
  const [code, setCode] = React.useState('');
  const [isReadOnly, setIsReadOnly] = React.useState(readOnly);
  const [showCopySuccess, setShowCopySuccess] = React.useState(false);

  const toggleReadOnly = () => {
    setIsReadOnly(!isReadOnly);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCode(content);
      };
      reader.readAsText(file);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setShowCopySuccess(true);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  React.useEffect(() => {
    if (initialYaml) {
      setCode(initialYaml);
    } else if (initialConfig) {
      setCode(yaml.dump(initialConfig));
    }
  }, [initialYaml, initialConfig]);

  return (
    <Box>
      <Typography variant="body1" gutterBottom>
        This is the YAML config that defines the evaluation and is processed by promptfoo. See{' '}
        <Link target="_blank" to="https://promptfoo.dev/docs/configuration/guide">
          configuration docs
        </Link>{' '}
        to learn more.
      </Typography>
      {!readOnly && (
        <Box display="flex" gap={2} mb={2}>
          <Button
            variant="text"
            color="primary"
            startIcon={isReadOnly ? <EditIcon /> : <SaveIcon />}
            onClick={toggleReadOnly}
          >
            {isReadOnly ? 'Edit YAML' : 'Save'}
          </Button>
          <Button variant="text" color="primary" startIcon={<UploadIcon />} component="label">
            Upload YAML
            <input type="file" hidden accept=".yaml,.yml" onChange={handleFileUpload} />
          </Button>
        </Box>
      )}
      <Box position="relative">
        <div className={`editor-container ${!readOnly && !isReadOnly ? 'glowing-border' : ''}`}>
          <Editor
            autoCapitalize="off"
            value={code}
            onValueChange={(code) => {
              if (!isReadOnly) {
                setCode(code);
              }
            }}
            highlight={(code) => highlight(code, languages.yaml)}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
            }}
            disabled={isReadOnly}
          />
        </div>
        <Tooltip title="Copy YAML">
          <IconButton
            onClick={handleCopy}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Snackbar
        open={showCopySuccess}
        autoHideDuration={2000}
        onClose={() => setShowCopySuccess(false)}
        message="YAML copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default YamlEditorComponent;
