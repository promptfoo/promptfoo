import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Editor from 'react-simple-code-editor';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { alpha, useTheme } from '@mui/material/styles';
import yaml from 'js-yaml';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-yaml';
import { useDebounce } from 'use-debounce';
import {
  TransitionBox,
  TransitionTypography,
  TransitionButton,
  TransitionIconButton,
  TransitionPaper,
  ActionButtonsStack,
} from './shared/TransitionComponents';
import './YamlEditor.css';
import 'prismjs/themes/prism.css';

// Define a more specific type for YAML configuration
interface YamlConfig {
  prompts?: string[] | Record<string, any>[];
  providers?: string[] | Record<string, any>[];
  tests?: Record<string, any>[];
  [key: string]: any; // Allow other properties while still providing some type safety
}

interface YamlEditorProps {
  initialConfig?: YamlConfig;
  readOnly?: boolean;
  initialYaml?: string;
  onChange?: (yaml: string, parsed: YamlConfig | null) => void;
}

interface NotificationState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
}

const YamlEditorComponent: React.FC<YamlEditorProps> = ({
  initialConfig,
  readOnly = false,
  initialYaml,
  onChange,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const [code, setCode] = useState<string>('');
  const [isReadOnly, setIsReadOnly] = useState<boolean>(readOnly);
  const [notification, setNotification] = useState<NotificationState>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [yamlError, setYamlError] = useState<string | null>(null);

  // Use the useDebounce hook to create a debounced version of code
  const [debouncedCode] = useDebounce(code, 300);

  // Parse YAML and handle errors
  const parseYaml = useCallback((yamlStr: string): YamlConfig | null => {
    try {
      const parsed = yaml.load(yamlStr) as YamlConfig;
      setYamlError(null);
      return parsed;
    } catch (err) {
      const error = err as Error;
      setYamlError(error.message);
      return null;
    }
  }, []);

  // Process debounced code changes
  useEffect(() => {
    if (debouncedCode && onChange && !isReadOnly) {
      const parsed = parseYaml(debouncedCode);
      onChange(debouncedCode, parsed);
    }
  }, [debouncedCode, onChange, parseYaml, isReadOnly]);

  // Handle code changes
  const handleCodeChange = useCallback(
    (value: string) => {
      if (!isReadOnly) {
        setCode(value);
      }
    },
    [isReadOnly],
  );

  // Toggle read-only mode
  const toggleReadOnly = useCallback(() => {
    setIsReadOnly((prev) => !prev);
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCode(content);
      };
      reader.readAsText(file);
    }
  }, []);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setNotification({
        open: true,
        message: 'YAML copied to clipboard',
        severity: 'success',
      });
    } catch (err) {
      console.error('Failed to copy text:', err);
      setNotification({
        open: true,
        message: 'Failed to copy to clipboard',
        severity: 'error',
      });
    }
  }, [code]);

  // Close notification
  const handleCloseNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, open: false }));
  }, []);

  // Initialize the editor
  useEffect(() => {
    if (initialYaml) {
      setCode(initialYaml);
      parseYaml(initialYaml);
    } else if (initialConfig) {
      try {
        const yamlStr = yaml.dump(initialConfig);
        setCode(yamlStr);
      } catch (err) {
        console.error('Failed to dump initial config to YAML:', err);
        setYamlError('Failed to parse initial configuration');
      }
    }
  }, [initialYaml, initialConfig, parseYaml]);

  // Editor style based on theme
  const editorStyle = useMemo(
    () => ({
      fontFamily: '"Fira code", "Fira Mono", monospace',
      fontSize: 14,
      backgroundColor: 'transparent',
      color: theme.palette.text.primary,
      transition: theme.transitions.create(['background-color', 'color'], {
        duration: theme.transitions.duration.standard,
      }),
    }),
    [isDarkMode, theme],
  );

  // Determine if the editor is in edit mode
  const isEditing = !readOnly && !isReadOnly;

  return (
    <TransitionBox>
      <TransitionTypography variant="body1" gutterBottom>
        This is the YAML config that defines the evaluation and is processed by promptfoo. See{' '}
        <Link
          target="_blank"
          to="https://promptfoo.dev/docs/configuration/guide"
          style={{
            color: theme.palette.primary.main,
            transition: theme.transitions.create('color', {
              duration: theme.transitions.duration.standard,
            }),
          }}
        >
          configuration docs
        </Link>{' '}
        to learn more.
      </TransitionTypography>

      {!readOnly && (
        <ActionButtonsStack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TransitionButton
            variant="outlined"
            startIcon={isReadOnly ? <EditIcon /> : <SaveIcon />}
            onClick={toggleReadOnly}
            aria-label={isReadOnly ? 'Edit YAML' : 'Save YAML'}
          >
            {isReadOnly ? 'Edit YAML' : 'Save'}
          </TransitionButton>

          <TransitionButton
            variant="outlined"
            startIcon={<UploadIcon />}
            component="label"
            aria-label="Upload YAML file"
          >
            Upload YAML
            <input
              type="file"
              hidden
              accept=".yaml,.yml"
              onChange={handleFileUpload}
              aria-hidden="true"
            />
          </TransitionButton>
        </ActionButtonsStack>
      )}

      {yamlError && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            transition: theme.transitions.create(['background-color', 'color', 'border-color'], {
              duration: theme.transitions.duration.standard,
            }),
          }}
          icon={<ErrorOutlineIcon />}
        >
          {yamlError}
        </Alert>
      )}

      <TransitionPaper
        elevation={1}
        sx={{
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          p: 0,
          boxShadow: isEditing ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.3)}` : 'none',
        }}
      >
        <div
          className={isEditing ? 'editor-active' : 'editor-inactive'}
          role="textbox"
          aria-label="YAML Editor"
          aria-readonly={isReadOnly}
        >
          <Editor
            autoCapitalize="off"
            value={code}
            onValueChange={handleCodeChange}
            highlight={(code) => highlight(code, languages.yaml)}
            padding={16}
            style={editorStyle}
            disabled={isReadOnly}
          />
        </div>
        <TransitionIconButton
          onClick={handleCopy}
          tooltip="Copy YAML"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: alpha(theme.palette.action.active, 0.1),
            '&:hover': {
              bgcolor: alpha(theme.palette.action.active, 0.2),
            },
          }}
          aria-label="Copy YAML to clipboard"
        >
          <ContentCopyIcon fontSize="small" />
        </TransitionIconButton>
      </TransitionPaper>

      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          sx={{ width: '100%' }}
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </TransitionBox>
  );
};

export default React.memo(YamlEditorComponent);
