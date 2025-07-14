import React from 'react';
import {
  Box,
  Card,
  Typography,
  Stack,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import type { TestCase, Assertion } from '@promptfoo/types';

interface TestCasePreviewProps {
  testCase: TestCase;
  prompts?: string[];
}

const TestCasePreview: React.FC<TestCasePreviewProps> = ({ testCase, prompts = [] }) => {
  const theme = useTheme();
  const { description, vars = {}, assert: assertions = [] } = testCase;

  // Replace variables in a prompt
  const renderPromptWithVars = (prompt: string): string => {
    let rendered = prompt;
    Object.entries(vars).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, value);
    });
    return rendered;
  };

  // Get a human-readable description of an assertion
  const getAssertionDescription = (assertion: Assertion): string => {
    const { type, value } = assertion;
    switch (type) {
      case 'contains':
        return `Output must contain: "${value}"`;
      case 'not-contains':
        return `Output must NOT contain: "${value}"`;
      case 'equals':
        return `Output must equal: "${value}"`;
      case 'llm-rubric':
        return `AI will grade based on: "${value}"`;
      case 'is-json':
        return 'Output must be valid JSON';
      case 'latency':
        return `Response time must be under ${value}ms`;
      case 'moderation':
        return 'Output must pass content moderation';
      case 'similar':
        return `Output should be similar to: "${value}"`;
      default:
        return `${type}: ${value || '(no value)'}`;
    }
  };

  const hasPrompts = prompts.length > 0;
  const hasVars = Object.keys(vars).length > 0;
  const hasAssertions = assertions.length > 0;

  return (
    <Stack spacing={3}>
      {/* Test Case Summary */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>
            Test Case Summary
          </Typography>

          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              icon={<CodeIcon sx={{ fontSize: 16 }} />}
              label={`${Object.keys(vars).length} variables`}
              size="small"
              variant="outlined"
            />
            <Chip
              icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
              label={`${assertions.length} assertions`}
              size="small"
              variant="outlined"
              color={assertions.length > 0 ? 'success' : 'default'}
            />
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                "{description}"
              </Typography>
            )}
          </Stack>
        </Stack>
      </Card>

      {/* Variables Table */}
      {hasVars && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Variable Values
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Variable</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(vars).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell>
                      <Chip
                        label={`{{${key}}}`}
                        size="small"
                        sx={{
                          fontFamily: 'monospace',
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily:
                            value.includes('\n') || value.startsWith('{') ? 'monospace' : 'inherit',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {value || <em>(empty)</em>}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Prompt Preview */}
      {hasPrompts && hasVars && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Prompt Preview
          </Typography>
          <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2, borderRadius: 1 }}>
            <Typography variant="body2">
              This is how your prompts will look with the test case variables applied:
            </Typography>
          </Alert>

          <Stack spacing={2}>
            {prompts.map((prompt, index) => {
              const rendered = renderPromptWithVars(prompt);
              const hasChanged = rendered !== prompt;

              return (
                <Card
                  key={index}
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: alpha(theme.palette.background.paper, 0.5),
                    borderColor: hasChanged ? theme.palette.success.main : theme.palette.divider,
                    borderWidth: hasChanged ? 2 : 1,
                  }}
                >
                  <Stack spacing={1}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <FormatQuoteIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        Prompt {index + 1}
                      </Typography>
                      {hasChanged && (
                        <Chip
                          label="Variables applied"
                          size="small"
                          color="success"
                          sx={{ height: 20, fontSize: '0.75rem' }}
                        />
                      )}
                    </Box>
                    <Typography
                      variant="body1"
                      sx={{
                        fontFamily: 'inherit',
                        whiteSpace: 'pre-wrap',
                        p: 1.5,
                        borderRadius: 1,
                        backgroundColor: alpha(
                          hasChanged ? theme.palette.success.main : theme.palette.action.hover,
                          0.05,
                        ),
                      }}
                    >
                      {rendered}
                    </Typography>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Box>
      )}

      {/* Assertions List */}
      {hasAssertions && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Assertions to Check
          </Typography>
          <Stack spacing={1}>
            {assertions.map((assertion, index) => (
              <Card
                key={index}
                variant="outlined"
                sx={{
                  p: 1.5,
                  backgroundColor: alpha(theme.palette.background.paper, 0.5),
                }}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
                  <Typography variant="body2">{getAssertionDescription(assertion)}</Typography>
                </Box>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {/* Empty States */}
      {!hasVars && !hasAssertions && (
        <Alert severity="warning" sx={{ borderRadius: 1 }}>
          <Typography variant="body2">
            This test case has no variables or assertions defined yet.
          </Typography>
        </Alert>
      )}

      {/* YAML Preview */}
      <Box>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          YAML Configuration
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          }}
        >
          <Typography
            component="pre"
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {generateYamlPreview(testCase)}
          </Typography>
        </Paper>
      </Box>
    </Stack>
  );
};

// Generate YAML preview of the test case
function generateYamlPreview(testCase: TestCase): string {
  const lines: string[] = ['- vars:'];

  // Add variables
  if (testCase.vars && Object.keys(testCase.vars).length > 0) {
    Object.entries(testCase.vars).forEach(([key, value]) => {
      if (value.includes('\n')) {
        lines.push(`    ${key}: |`);
        value.split('\n').forEach((line) => {
          lines.push(`      ${line}`);
        });
      } else if (value.startsWith('{') || value.startsWith('[')) {
        // Likely JSON
        lines.push(`    ${key}: ${value}`);
      } else {
        lines.push(`    ${key}: "${value}"`);
      }
    });
  } else {
    lines.push('    # No variables defined');
  }

  // Add description if present
  if (testCase.description) {
    lines.push(`  description: "${testCase.description}"`);
  }

  // Add assertions
  if (testCase.assert && testCase.assert.length > 0) {
    lines.push('  assert:');
    testCase.assert.forEach((assertion) => {
      lines.push(`    - type: ${assertion.type}`);
      if (assertion.value) {
        lines.push(`      value: "${assertion.value}"`);
      }
    });
  }

  return lines.join('\n');
}

export default TestCasePreview;
