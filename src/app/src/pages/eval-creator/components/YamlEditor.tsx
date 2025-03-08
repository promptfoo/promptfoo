import React from 'react';
import { Link } from 'react-router-dom';
import Editor from 'react-simple-code-editor';
import { useStore } from '@app/stores/evalConfig';
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
  // Always start in read-only mode on initial load, but respect the readOnly prop
  const [isReadOnly, setIsReadOnly] = React.useState(true);
  const [parseError, setParseError] = React.useState<string | null>(null);

  // Notification state
  const [notification, setNotification] = React.useState<{
    show: boolean;
    message: string;
  }>({ show: false, message: '' });

  const { getTestSuite } = useStore();

  // Parse YAML and update the store
  const parseAndUpdateStore = (yamlContent: string) => {
    try {
      const parsedConfig = yaml.load(yamlContent) as Record<string, any>;
      if (parsedConfig && typeof parsedConfig === 'object') {
        // Directly update the store state without using the filtering functions
        // that might expect strings where objects are provided
        useStore.setState((state) => {
          // Create a new state object with existing values as defaults
          const newState = {
            ...state,
          };

          // Only update defined fields from the config
          if (parsedConfig.description !== undefined) {
            newState.description = parsedConfig.description;
          }

          if (parsedConfig.providers !== undefined) {
            newState.providers = parsedConfig.providers;
          }

          // Special handling for prompts which can be complex objects
          if (parsedConfig.prompts !== undefined) {
            // Preserve the exact structure without any transformation
            newState.prompts = parsedConfig.prompts;
          }

          // Map tests to testCases
          if (parsedConfig.tests !== undefined) {
            newState.testCases = parsedConfig.tests;
          }

          // Handle other fields
          if (parsedConfig.defaultTest !== undefined) {
            newState.defaultTest = parsedConfig.defaultTest;
          }

          if (parsedConfig.evaluateOptions !== undefined) {
            newState.evaluateOptions = parsedConfig.evaluateOptions;
          }

          if (parsedConfig.scenarios !== undefined) {
            newState.scenarios = parsedConfig.scenarios;
          }

          if (parsedConfig.extensions !== undefined) {
            newState.extensions = parsedConfig.extensions;
          }

          if (parsedConfig.env !== undefined) {
            newState.env = parsedConfig.env;
          }

          return newState;
        });

        setParseError(null);
        setNotification({ show: true, message: 'Configuration saved successfully' });
        return true; // Indicate successful parsing
      } else {
        const errorMsg = 'Invalid YAML configuration';
        setParseError(errorMsg);
        setNotification({ show: true, message: errorMsg });
        return false; // Indicate parsing failure
      }
    } catch (err) {
      const errorMsg = `Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`;
      console.error(errorMsg, err);
      setParseError(errorMsg);
      setNotification({ show: true, message: errorMsg });
      return false; // Indicate parsing failure
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCode(content);
        // Switch to edit mode if we're in read-only
        if (isReadOnly) {
          setIsReadOnly(false);
        }
        // Automatically try to parse and update store with uploaded file
        // but don't switch to read-only automatically - let the user review
        parseAndUpdateStore(content);
      };
      reader.onerror = () => {
        const errorMsg = 'Failed to read the uploaded file';
        setParseError(errorMsg);
        setNotification({ show: true, message: errorMsg });
        // Make sure we're in edit mode so the user can fix issues
        setIsReadOnly(false);
      };
      try {
        reader.readAsText(file);
      } catch (err) {
        const errorMsg = `Error loading file: ${err instanceof Error ? err.message : String(err)}`;
        setParseError(errorMsg);
        setNotification({ show: true, message: errorMsg });
        // Make sure we're in edit mode so the user can fix issues
        setIsReadOnly(false);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setNotification({ show: true, message: 'YAML copied to clipboard' });
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  React.useEffect(() => {
    if (initialYaml) {
      setCode(initialYaml);
    } else if (initialConfig) {
      setCode(yaml.dump(initialConfig));
    } else {
      // If no initial config is provided, generate from current store state
      const currentConfig = getTestSuite();
      setCode(yaml.dump(currentConfig));
    }
    // Deliberately omitting getTestSuite from dependencies to avoid potential re-render loops
    // The effect should only run when initialYaml or initialConfig changes
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box display="flex" gap={2}>
            <Button
              variant={isReadOnly ? 'outlined' : 'contained'}
              color="primary"
              startIcon={isReadOnly ? <EditIcon /> : <SaveIcon />}
              onClick={() => {
                if (isReadOnly) {
                  // Simply switch to edit mode
                  setIsReadOnly(false);
                } else {
                  // If we're in edit mode, try to apply changes
                  // Only switch to read-only if parsing was successful
                  const parseSuccess = parseAndUpdateStore(code);
                  if (parseSuccess) {
                    setIsReadOnly(true);
                  }
                  // If parsing failed, we stay in edit mode
                }
              }}
            >
              {isReadOnly ? 'Edit YAML' : 'Save Changes'}
            </Button>
            <Button variant="text" color="primary" startIcon={<UploadIcon />} component="label">
              Upload YAML
              <input type="file" hidden accept=".yaml,.yml" onChange={handleFileUpload} />
            </Button>
            {!isReadOnly && (
              <Button
                variant="text"
                color="warning"
                onClick={() => {
                  const currentConfig = getTestSuite();
                  setCode(yaml.dump(currentConfig));
                  setNotification({ show: true, message: 'Reset to last saved configuration' });
                }}
              >
                Reset
              </Button>
            )}
          </Box>
          {!isReadOnly && (
            <Typography variant="caption" color="text.secondary">
              Editing mode active - changes will be applied when you save
            </Typography>
          )}
        </Box>
      )}
      <Box position="relative">
        <div
          className={`editor-container ${
            isReadOnly ? (readOnly ? '' : 'editor-readonly') : 'glowing-border'
          }`}
        >
          {!isReadOnly && <div className="editing-indicator">Editing</div>}
          <Editor
            autoCapitalize="off"
            value={code}
            onValueChange={(newCode) => {
              if (!isReadOnly) {
                // Clear any error messages as soon as the user starts typing
                if (parseError) {
                  setParseError(null);
                }
                setCode(newCode);
              }
            }}
            highlight={(code) => highlight(code, languages.yaml)}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              backgroundColor: darkMode ? '#1e1e1e' : '#fff',
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
        open={notification.show}
        autoHideDuration={2000}
        onClose={() => setNotification({ ...notification, show: false })}
        message={notification.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default YamlEditorComponent;
