import React from 'react';
import { Link } from 'react-router-dom';
import Editor from 'react-simple-code-editor';
import { useStore } from '@app/stores/evalConfig';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import CancelIcon from '@mui/icons-material/Cancel';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { styled } from '@mui/system';
import type { UnifiedConfig } from '@promptfoo/types';
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

// Schema comment that should always be at the top of the YAML file
const YAML_SCHEMA_COMMENT =
  '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json';

// Ensure the schema comment is at the top of YAML content
const ensureSchemaComment = (yamlContent: string): string => {
  if (!yamlContent.trim().startsWith(YAML_SCHEMA_COMMENT)) {
    return `${YAML_SCHEMA_COMMENT}\n${yamlContent}`;
  }
  return yamlContent;
};

const formatYamlWithSchema = (config: any): string => {
  const yamlContent = yaml.dump(config);
  return ensureSchemaComment(yamlContent);
};

const StyledLink = styled(Link)({
  fontWeight: 'medium',
  textDecoration: 'none',
});

const YamlEditorComponent: React.FC<YamlEditorProps> = ({
  initialConfig,
  readOnly = false,
  initialYaml,
}) => {
  const darkMode = useTheme().palette.mode === 'dark';
  const [code, setCode] = React.useState('');
  const [originalCode, setOriginalCode] = React.useState('');
  const [isEditing, setIsEditing] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  const [notification, setNotification] = React.useState<{
    show: boolean;
    message: string;
    severity?: 'success' | 'error' | 'warning' | 'info';
  }>({ show: false, message: '', severity: 'info' });

  const { getTestSuite, updateConfig } = useStore();

  const parseAndUpdateStore = (yamlContent: string) => {
    try {
      // Remove the schema comment for parsing if it exists
      const contentForParsing = yamlContent.replace(YAML_SCHEMA_COMMENT, '').trim();
      const parsedConfig = yaml.load(contentForParsing) as Record<string, any>;

      if (parsedConfig && typeof parsedConfig === 'object') {
        // Simply update the config with the parsed YAML
        // The store will handle the mapping
        updateConfig(parsedConfig as Partial<UnifiedConfig>);

        setParseError(null);
        setNotification({
          show: true,
          message: 'Configuration saved successfully',
          severity: 'success',
        });
        return true;
      } else {
        const errorMsg = 'Invalid YAML configuration';
        setParseError(errorMsg);
        setNotification({ show: true, message: errorMsg, severity: 'error' });
        return false;
      }
    } catch (err) {
      const errorMsg = `Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`;
      console.error(errorMsg, err);
      setParseError(errorMsg);
      setNotification({ show: true, message: errorMsg, severity: 'error' });
      return false;
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          // If in edit mode, just update the code
          if (isEditing) {
            setCode(ensureSchemaComment(content));
            setHasUnsavedChanges(true);
            setNotification({ show: true, message: 'File loaded into editor', severity: 'info' });
          } else {
            // If not in edit mode, parse and save immediately
            const tempCode = ensureSchemaComment(content);
            if (parseAndUpdateStore(tempCode)) {
              setCode(tempCode);
              setOriginalCode(tempCode);
            }
          }
        }
      };
      reader.onerror = () => {
        setNotification({ show: true, message: 'Failed to read file', severity: 'error' });
      };
      reader.readAsText(file);
    }
    // Reset the input
    event.target.value = '';
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setNotification({ show: true, message: 'YAML copied to clipboard', severity: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      setNotification({ show: true, message: 'Failed to copy YAML', severity: 'error' });
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setOriginalCode(code);
    setHasUnsavedChanges(false);
  };

  const handleSave = () => {
    const success = parseAndUpdateStore(code);
    if (success) {
      setIsEditing(false);
      setOriginalCode(code);
      setHasUnsavedChanges(false);
    }
  };

  const handleCancel = () => {
    setCode(originalCode);
    setIsEditing(false);
    setHasUnsavedChanges(false);
    setParseError(null);
    setNotification({ show: true, message: 'Changes discarded', severity: 'info' });
  };

  const handleReset = () => {
    const currentConfig = getTestSuite();
    const newCode = formatYamlWithSchema(currentConfig);
    setCode(newCode);
    setHasUnsavedChanges(code !== newCode);
    setNotification({ show: true, message: 'Reset to current configuration', severity: 'info' });
  };

  React.useEffect(() => {
    if (initialYaml) {
      const formattedCode = ensureSchemaComment(initialYaml);
      setCode(formattedCode);
      setOriginalCode(formattedCode);
    } else if (initialConfig) {
      const formattedCode = formatYamlWithSchema(initialConfig);
      setCode(formattedCode);
      setOriginalCode(formattedCode);
    } else {
      const currentConfig = getTestSuite();
      const formattedCode = formatYamlWithSchema(currentConfig);
      setCode(formattedCode);
      setOriginalCode(formattedCode);
    }
    // Deliberately omitting getTestSuite from dependencies to avoid potential re-render loops
  }, [initialYaml, initialConfig]);

  // Track unsaved changes
  React.useEffect(() => {
    if (isEditing && code !== originalCode) {
      setHasUnsavedChanges(true);
    }
  }, [code, originalCode, isEditing]);

  return (
    <Box>
      <Box
        sx={{
          mb: 3,
          p: 2,
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
          borderRadius: 1,
          borderLeft: '4px solid',
          borderColor: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" color="primary.main" gutterBottom>
            YAML Configuration
          </Typography>
          <Typography variant="body2">
            This configuration defines your evaluation parameters and can be exported for use with
            the promptfoo CLI.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <StyledLink target="_blank" to="https://promptfoo.dev/docs/configuration/guide">
              View documentation →
            </StyledLink>
          </Typography>
        </Box>
        {!readOnly && (
          <Stack direction="row" spacing={1}>
            {isEditing ? (
              <>
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  startIcon={<SaveIcon />}
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges}
                >
                  Save
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  startIcon={<CancelIcon />}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<EditIcon />}
                onClick={handleEdit}
              >
                Edit YAML
              </Button>
            )}
          </Stack>
        )}
      </Box>

      {/* Action bar - only show when editing */}
      {!readOnly && isEditing && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={2}>
              <Button
                variant="text"
                color="primary"
                size="small"
                startIcon={<UploadIcon />}
                component="label"
              >
                Upload File
                <input type="file" hidden accept=".yaml,.yml" onChange={handleFileUpload} />
              </Button>
              <Button variant="text" color="inherit" size="small" onClick={handleReset}>
                Reset to Current
              </Button>
            </Stack>
            {hasUnsavedChanges && (
              <Typography variant="caption" color="warning.main" fontWeight="medium">
                ● Unsaved changes
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {/* Error display */}
      {parseError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setParseError(null)}>
          {parseError}
        </Alert>
      )}

      <Box position="relative">
        <div
          className={`editor-container ${isEditing ? '' : 'editor-readonly'}`}
          style={{
            opacity: isEditing ? 1 : 0.9,
            border: isEditing ? '2px solid' : '1px solid',
            borderColor: isEditing
              ? darkMode
                ? '#90caf9'
                : '#1976d2'
              : darkMode
                ? 'rgba(255, 255, 255, 0.12)'
                : 'rgba(0, 0, 0, 0.12)',
            borderRadius: '4px',
            transition: 'all 0.2s ease-in-out',
          }}
        >
          <Editor
            autoCapitalize="off"
            value={code}
            onValueChange={(newCode) => {
              if (isEditing) {
                setCode(newCode);
                if (parseError) {
                  setParseError(null);
                }
              }
            }}
            highlight={(code) => highlight(code, languages.yaml)}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              backgroundColor: darkMode ? '#1e1e1e' : '#fff',
              minHeight: '400px',
            }}
            disabled={!isEditing}
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
        open={notification.show}
        autoHideDuration={3000}
        onClose={() => setNotification({ ...notification, show: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setNotification({ ...notification, show: false })}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default YamlEditorComponent;
