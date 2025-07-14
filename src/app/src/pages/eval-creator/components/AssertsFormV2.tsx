import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  TextField,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Alert,
  Chip,
  Collapse,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Grid,
  Paper,
  alpha,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import type { Assertion, AssertionType } from '@promptfoo/types';

interface AssertsFormV2Props {
  asserts: Assertion[];
  onChange: (asserts: Assertion[]) => void;
  vars?: Record<string, string>;
  prompts?: string[];
}

// Categorize assertion types
const assertionCategories = {
  'Text Matching': {
    icon: '📝',
    description: 'Check if output contains or matches specific text',
    types: [
      { type: 'contains', label: 'Contains', example: 'hello world' },
      { type: 'not-contains', label: 'Does not contain', example: 'error' },
      { type: 'equals', label: 'Equals exactly', example: 'exact match' },
      { type: 'not-equals', label: 'Does not equal', example: 'wrong answer' },
      { type: 'icontains', label: 'Contains (case-insensitive)', example: 'Hello' },
      { type: 'starts-with', label: 'Starts with', example: 'Dear' },
      { type: 'regex', label: 'Regex match', example: '^[A-Z].+\\.$' },
    ],
  },
  'Structure & Format': {
    icon: '🏗️',
    description: 'Validate output structure and format',
    types: [
      { type: 'is-json', label: 'Is valid JSON', example: '' },
      { type: 'contains-json', label: 'Contains JSON', example: '{"key": "value"}' },
      { type: 'is-xml', label: 'Is valid XML', example: '' },
      { type: 'is-sql', label: 'Is valid SQL', example: '' },
      { type: 'is-valid-openai-function-call', label: 'Valid function call', example: '' },
    ],
  },
  'Quality & Scoring': {
    icon: '⭐',
    description: 'Evaluate output quality using AI or metrics',
    types: [
      {
        type: 'llm-rubric',
        label: 'LLM grading rubric',
        example: 'Response is helpful and accurate',
      },
      { type: 'model-graded-closedqa', label: 'Closed Q&A grading', example: 'Paris' },
      { type: 'factuality', label: 'Factual accuracy', example: '' },
      { type: 'answer-relevance', label: 'Answer relevance', example: '' },
      { type: 'similar', label: 'Semantic similarity', example: 'The capital of France is Paris' },
    ],
  },
  Performance: {
    icon: '🚀',
    description: 'Check performance metrics',
    types: [
      { type: 'latency', label: 'Response time (ms)', example: '1000' },
      { type: 'cost', label: 'Cost threshold', example: '0.01' },
      { type: 'perplexity-score', label: 'Perplexity score', example: '10' },
    ],
  },
  'Safety & Moderation': {
    icon: '🛡️',
    description: 'Ensure safe and appropriate content',
    types: [
      { type: 'moderation', label: 'Content moderation', example: '' },
      { type: 'pi', label: 'No personal info (PII)', example: '' },
    ],
  },
};

interface AssertionTemplate {
  name: string;
  description: string;
  assertions: Array<{ type: AssertionType; value: string }>;
}

const assertionTemplates: AssertionTemplate[] = [
  {
    name: 'Basic Quality Check',
    description: 'Ensure response is complete and appropriate',
    assertions: [
      { type: 'contains', value: '{{topic}}' },
      { type: 'not-contains', value: 'I cannot' },
      { type: 'latency', value: '5000' },
    ],
  },
  {
    name: 'JSON API Response',
    description: 'Validate JSON structure and content',
    assertions: [
      { type: 'is-json', value: '' },
      { type: 'contains-json', value: '{"status": "success"}' },
    ],
  },
  {
    name: 'Safe & Helpful',
    description: 'Ensure response is safe and helpful',
    assertions: [
      { type: 'moderation', value: '' },
      { type: 'llm-rubric', value: 'Response is helpful, accurate, and appropriate' },
    ],
  },
];

const AssertsFormV2: React.FC<AssertsFormV2Props> = ({
  asserts,
  onChange,
  vars = {},
  prompts = [],
}) => {
  const theme = useTheme();
  const [_activeTab, _setActiveTab] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [expandedAssertions, setExpandedAssertions] = useState<Set<number>>(new Set());

  const handleAddAssertion = (type?: AssertionType, value?: string) => {
    const newAssertion: Assertion = {
      type: type || 'contains',
      value: value || '',
    };
    onChange([...asserts, newAssertion]);
    // Auto-expand the new assertion
    setExpandedAssertions(new Set([...expandedAssertions, asserts.length]));
  };

  const handleUpdateAssertion = (index: number, updates: Partial<Assertion>) => {
    const newAsserts = [...asserts];
    newAsserts[index] = { ...newAsserts[index], ...updates };
    onChange(newAsserts);
  };

  const handleRemoveAssertion = (index: number) => {
    onChange(asserts.filter((_, i) => i !== index));
    // Remove from expanded set
    const newExpanded = new Set(expandedAssertions);
    newExpanded.delete(index);
    setExpandedAssertions(newExpanded);
  };

  const handleDuplicateAssertion = (index: number) => {
    const assertion = asserts[index];
    onChange([...asserts, { ...assertion }]);
  };

  const applyTemplate = (template: AssertionTemplate) => {
    onChange([...asserts, ...template.assertions]);
    setShowTemplates(false);
  };

  const _toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedAssertions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedAssertions(newExpanded);
  };

  const getAssertionIcon = (type: AssertionType) => {
    if (type.includes('not-')) { return <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />; }
    if (['contains', 'equals', 'icontains'].includes(type)) {
      return <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />;
    }
    if (['llm-rubric', 'model-graded-closedqa'].includes(type)) {
      return <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />;
    }
    if (['latency', 'cost'].includes(type)) {
      return <InfoIcon sx={{ fontSize: 16, color: 'info.main' }} />;
    }
    if (['moderation', 'pi'].includes(type)) {
      return <WarningIcon sx={{ fontSize: 16, color: 'warning.main' }} />;
    }
    return <CheckCircleIcon sx={{ fontSize: 16, color: 'action.active' }} />;
  };

  const getHelpText = (type: AssertionType): string => {
    const helpTexts: Record<string, string> = {
      contains: 'Check if the output contains this text',
      'not-contains': 'Ensure the output does NOT contain this text',
      equals: 'Output must exactly match this value',
      'llm-rubric': 'AI will grade based on this rubric/criteria',
      'model-graded-closedqa': 'Expected answer for closed Q&A',
      latency: 'Maximum response time in milliseconds',
      'is-json': 'Output must be valid JSON (leave value empty)',
      moderation: 'Check for inappropriate content (leave value empty)',
      similar: 'Output should be semantically similar to this text',
      regex: 'Regular expression pattern to match',
    };
    return helpTexts[type] || 'Configure the assertion value';
  };

  return (
    <Stack spacing={3}>
      {/* Header with actions */}
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" fontWeight={600}>
          Assertions
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<LightbulbIcon />}
            onClick={() => setShowTemplates(!showTemplates)}
            sx={{ textTransform: 'none' }}
          >
            Templates
          </Button>
          <Button
            size="small"
            startIcon={<AutoAwesomeIcon />}
            disabled
            sx={{ textTransform: 'none' }}
          >
            AI Suggest
          </Button>
        </Stack>
      </Box>

      {/* Templates */}
      <Collapse in={showTemplates}>
        <Paper
          variant="outlined"
          sx={{ p: 2, backgroundColor: alpha(theme.palette.primary.main, 0.02) }}
        >
          <Typography variant="body2" fontWeight={600} gutterBottom>
            Quick Templates
          </Typography>
          <Grid container spacing={1} sx={{ mt: 0.5 }}>
            {assertionTemplates.map((template, index) => (
              <Grid item xs={12} sm={4} key={index}>
                <Card
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                  onClick={() => applyTemplate(template)}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {template.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {template.description}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Collapse>

      {/* Existing assertions */}
      {asserts.length > 0 ? (
        <Stack spacing={2}>
          {asserts.map((assertion, index) => {
            const isExpanded = expandedAssertions.has(index);
            const category = Object.entries(assertionCategories).find(([_, cat]) =>
              cat.types.some((t) => t.type === assertion.type),
            );

            return (
              <Card
                key={index}
                variant="outlined"
                sx={{
                  p: 2,
                  backgroundColor: alpha(theme.palette.background.paper, 0.5),
                  borderColor: isExpanded ? theme.palette.primary.main : theme.palette.divider,
                  borderWidth: isExpanded ? 2 : 1,
                }}
              >
                <Stack spacing={1.5}>
                  {/* Header */}
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                      {getAssertionIcon(assertion.type)}
                      <Typography variant="body2" fontWeight={600}>
                        {assertion.type}
                      </Typography>
                      {category && (
                        <Chip
                          label={category[0]}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Duplicate">
                        <IconButton size="small" onClick={() => handleDuplicateAssertion(index)}>
                          <ContentCopyIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => handleRemoveAssertion(index)}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>

                  {/* Type selector */}
                  <FormControl size="small" fullWidth>
                    <InputLabel>Assertion Type</InputLabel>
                    <Select
                      value={assertion.type}
                      label="Assertion Type"
                      onChange={(e) =>
                        handleUpdateAssertion(index, { type: e.target.value as AssertionType })
                      }
                    >
                      {Object.entries(assertionCategories).map(([categoryName, category]) => [
                        <MenuItem key={`header-${categoryName}`} disabled>
                          <Typography variant="caption" color="text.secondary">
                            {category.icon} {categoryName}
                          </Typography>
                        </MenuItem>,
                        ...category.types.map(({ type, label }) => (
                          <MenuItem key={type} value={type} sx={{ pl: 4 }}>
                            {label}
                          </MenuItem>
                        )),
                      ])}
                    </Select>
                  </FormControl>

                  {/* Value input */}
                  {!['is-json', 'is-xml', 'is-sql', 'moderation', 'pi', 'factuality'].includes(
                    assertion.type,
                  ) && (
                    <>
                      <TextField
                        fullWidth
                        size="small"
                        label="Expected value"
                        placeholder={getHelpText(assertion.type)}
                        value={assertion.value}
                        onChange={(e) => handleUpdateAssertion(index, { value: e.target.value })}
                        multiline
                        minRows={1}
                        maxRows={4}
                        helperText={
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <HelpOutlineIcon sx={{ fontSize: 14 }} />
                            {getHelpText(assertion.type)}
                          </Box>
                        }
                      />
                      {/* Show available variables */}
                      {Object.keys(vars).length > 0 && (
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary">
                            Available vars:
                          </Typography>
                          {Object.keys(vars).map((varName) => (
                            <Chip
                              key={varName}
                              label={`{{${varName}}}`}
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                              }}
                              onClick={() => {
                                const newValue = assertion.value + ` {{${varName}}}`;
                                handleUpdateAssertion(index, { value: newValue.trim() });
                              }}
                            />
                          ))}
                        </Box>
                      )}
                    </>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Stack>
      ) : (
        <Alert
          severity="info"
          sx={{
            borderRadius: 1,
            backgroundColor: alpha(theme.palette.info.main, 0.08),
          }}
        >
          <Typography variant="body2">
            No assertions yet. Assertions help verify that AI outputs meet your requirements.
          </Typography>
        </Alert>
      )}

      {/* Add assertion - Category buttons */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Add assertion by category:
        </Typography>
        <Grid container spacing={1}>
          {Object.entries(assertionCategories).map(([categoryName, category]) => (
            <Grid item xs={12} sm={6} md={4} key={categoryName}>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: alpha(theme.palette.primary.main, 0.02),
                  },
                }}
                onClick={() => {
                  // Add the first assertion type from this category
                  const firstType = category.types[0];
                  handleAddAssertion(firstType.type as AssertionType, firstType.example);
                }}
              >
                <Stack spacing={0.5}>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Typography>{category.icon}</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {categoryName}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {category.description}
                  </Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Custom add button */}
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => handleAddAssertion()}
        sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
      >
        Add Custom Assertion
      </Button>
    </Stack>
  );
};

export default AssertsFormV2;
