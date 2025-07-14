import React, { useState } from 'react';
import {
  Box,
  Card,
  TextField,
  Typography,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  Alert,
  Button,
  Menu,
  MenuItem,
  Collapse,
  alpha,
  useTheme,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import CodeIcon from '@mui/icons-material/Code';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { TestCase } from '@promptfoo/types';

interface VarsFormV2Props {
  vars: Record<string, string>;
  varsList: string[];
  onChange: (vars: Record<string, string>) => void;
  validationErrors?: Record<string, string>;
  existingTestCases?: TestCase[];
}

type InputMode = 'text' | 'json' | 'multiline';

const VarsFormV2: React.FC<VarsFormV2Props> = ({
  vars,
  varsList,
  onChange,
  validationErrors = {},
  existingTestCases = [],
}) => {
  const theme = useTheme();
  const [inputModes, setInputModes] = useState<Record<string, InputMode>>({});
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<{
    element: HTMLElement | null;
    varName: string;
  }>({ element: null, varName: '' });

  const handleVarChange = (varName: string, value: string) => {
    onChange({
      ...vars,
      [varName]: value,
    });
  };

  const toggleInputMode = (varName: string) => {
    const modes: InputMode[] = ['text', 'multiline', 'json'];
    const currentMode = inputModes[varName] || 'text';
    const currentIndex = modes.indexOf(currentMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];

    setInputModes({
      ...inputModes,
      [varName]: nextMode,
    });

    // Auto-expand for multiline/json modes
    if (nextMode !== 'text') {
      setExpandedVars(new Set([...expandedVars, varName]));
    }
  };

  const getInputModeIcon = (mode: InputMode) => {
    switch (mode) {
      case 'json':
        return <DataObjectIcon sx={{ fontSize: 16 }} />;
      case 'multiline':
        return <CodeIcon sx={{ fontSize: 16 }} />;
      default:
        return <TextFieldsIcon sx={{ fontSize: 16 }} />;
    }
  };

  const getInputModeTooltip = (mode: InputMode) => {
    switch (mode) {
      case 'json':
        return 'JSON mode - Format and validate JSON';
      case 'multiline':
        return 'Multiline mode - Enter multiple lines';
      default:
        return 'Text mode - Single line input';
    }
  };

  const copyFromHistory = (varName: string, value: string) => {
    handleVarChange(varName, value);
    setHistoryMenuAnchor({ element: null, varName: '' });
  };

  const getHistoricalValues = (varName: string): string[] => {
    const values = new Set<string>();
    existingTestCases.forEach((tc) => {
      if (tc.vars?.[varName]) {
        values.add(tc.vars[varName]);
      }
    });
    return Array.from(values).slice(0, 5); // Show max 5 recent values
  };

  const validateJSON = (value: string): boolean => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  const formatJSON = (varName: string) => {
    const value = vars[varName] || '';
    try {
      const parsed = JSON.parse(value);
      handleVarChange(varName, JSON.stringify(parsed, null, 2));
    } catch {
      // Invalid JSON, don't format
    }
  };

  const toggleExpanded = (varName: string) => {
    const newExpanded = new Set(expandedVars);
    if (newExpanded.has(varName)) {
      newExpanded.delete(varName);
    } else {
      newExpanded.add(varName);
    }
    setExpandedVars(newExpanded);
  };

  if (varsList.length === 0) {
    return (
      <Alert
        severity="info"
        sx={{
          borderRadius: 1,
          backgroundColor: alpha(theme.palette.info.main, 0.08),
        }}
      >
        <Typography variant="body2">
          No variables found in your prompts. Add variables using <code>{`{{variable}}`}</code>{' '}
          syntax.
        </Typography>
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle1" fontWeight={600}>
          Variable Values
        </Typography>
        <Button
          size="small"
          startIcon={<AutoAwesomeIcon />}
          disabled
          sx={{ textTransform: 'none' }}
        >
          Fill with AI
        </Button>
      </Box>

      {varsList.map((varName) => {
        const error = validationErrors[`var_${varName}`];
        const value = vars[varName] || '';
        const mode = inputModes[varName] || 'text';
        const isExpanded = expandedVars.has(varName);
        const historicalValues = getHistoricalValues(varName);
        const isJSONValid = mode === 'json' ? validateJSON(value) : true;

        return (
          <Card
            key={varName}
            variant="outlined"
            sx={{
              p: 2,
              backgroundColor: error
                ? alpha(theme.palette.error.main, 0.02)
                : alpha(theme.palette.background.paper, 0.5),
              borderColor: error
                ? theme.palette.error.main
                : isExpanded
                  ? theme.palette.primary.main
                  : theme.palette.divider,
              borderWidth: error || isExpanded ? 2 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            <Stack spacing={1.5}>
              {/* Header */}
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={`{{${varName}}}`}
                    size="small"
                    color={error ? 'error' : 'primary'}
                    variant="outlined"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      backgroundColor: alpha(
                        error ? theme.palette.error.main : theme.palette.primary.main,
                        0.08,
                      ),
                    }}
                  />
                  {value && (
                    <Chip
                      label={`${value.length} chars`}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 20,
                        fontSize: '0.75rem',
                        borderColor: theme.palette.divider,
                      }}
                    />
                  )}
                </Stack>

                <Stack direction="row" spacing={0.5}>
                  {historicalValues.length > 0 && (
                    <Tooltip title="Use from history">
                      <IconButton
                        size="small"
                        onClick={(e) => setHistoryMenuAnchor({ element: e.currentTarget, varName })}
                      >
                        <HistoryIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={getInputModeTooltip(mode)}>
                    <IconButton size="small" onClick={() => toggleInputMode(varName)}>
                      {getInputModeIcon(mode)}
                    </IconButton>
                  </Tooltip>
                  {mode !== 'text' && (
                    <Tooltip title={isExpanded ? 'Collapse' : 'Expand'}>
                      <IconButton
                        size="small"
                        onClick={() => toggleExpanded(varName)}
                        sx={{
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      >
                        <ExpandMoreIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Box>

              {/* Input field */}
              <Collapse in={mode === 'text' || isExpanded} timeout="auto">
                <TextField
                  fullWidth
                  size="small"
                  placeholder={`Enter value for ${varName}`}
                  value={value}
                  onChange={(e) => handleVarChange(varName, e.target.value)}
                  error={!!error || (mode === 'json' && !isJSONValid)}
                  helperText={error || (mode === 'json' && !isJSONValid && 'Invalid JSON format')}
                  multiline={mode !== 'text'}
                  minRows={mode === 'text' ? 1 : 3}
                  maxRows={mode === 'text' ? 1 : 10}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontFamily: mode === 'json' ? 'monospace' : 'inherit',
                      fontSize: mode === 'json' ? '0.875rem' : 'inherit',
                    },
                  }}
                  InputProps={{
                    endAdornment: mode === 'json' && value && (
                      <Tooltip title="Format JSON">
                        <IconButton
                          size="small"
                          onClick={() => formatJSON(varName)}
                          disabled={!isJSONValid}
                          sx={{ mr: -1 }}
                        >
                          <AutoAwesomeIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    ),
                  }}
                />
              </Collapse>

              {/* Examples or help text */}
              {!value && !error && (
                <Box display="flex" alignItems="center" gap={0.5}>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    {mode === 'json'
                      ? 'Example: {"name": "John", "age": 30}'
                      : mode === 'multiline'
                        ? 'Press Enter for new lines, Shift+Enter to submit'
                        : `Example: ${getExampleForVariable(varName)}`}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Card>
        );
      })}

      {/* History menu */}
      <Menu
        anchorEl={historyMenuAnchor.element}
        open={Boolean(historyMenuAnchor.element)}
        onClose={() => setHistoryMenuAnchor({ element: null, varName: '' })}
      >
        <MenuItem disabled dense>
          <Typography variant="caption" color="text.secondary">
            Recent values
          </Typography>
        </MenuItem>
        {historyMenuAnchor.varName &&
          getHistoricalValues(historyMenuAnchor.varName).map((histValue, index) => (
            <MenuItem
              key={index}
              onClick={() => copyFromHistory(historyMenuAnchor.varName, histValue)}
              sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            >
              <Box display="flex" alignItems="center" gap={1} width="100%">
                <ContentCopyIcon sx={{ fontSize: 16, color: 'action.active' }} />
                <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                  {histValue}
                </Typography>
              </Box>
            </MenuItem>
          ))}
      </Menu>
    </Stack>
  );
};

// Helper function to provide contextual examples
function getExampleForVariable(varName: string): string {
  const lowerName = varName.toLowerCase();
  if (lowerName.includes('name')) return 'John Doe';
  if (lowerName.includes('email')) return 'user@example.com';
  if (lowerName.includes('age')) return '25';
  if (lowerName.includes('url')) return 'https://example.com';
  if (lowerName.includes('date')) return '2024-01-15';
  if (lowerName.includes('phone')) return '+1-555-0123';
  if (lowerName.includes('address')) return '123 Main St';
  if (lowerName.includes('city')) return 'San Francisco';
  if (lowerName.includes('country')) return 'United States';
  if (lowerName.includes('description')) return 'A brief description';
  return 'Sample value';
}

export default VarsFormV2;
