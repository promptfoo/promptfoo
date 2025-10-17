import React from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';

interface TransformTestDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  transformCode: string;
  onTransformCodeChange: (code: string) => void;
  testInput: string;
  onTestInputChange: (input: string) => void;
  testInputLabel: string;
  testInputPlaceholder: string;
  testInputRows?: number;
  onTest: (
    transformCode: string,
    testInput: string,
  ) => Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }>;
  onApply?: (transformCode: string) => void;
  functionDocumentation: {
    signature: string;
    description: React.ReactNode;
    successMessage: string;
    outputLabel: string;
  };
}

const highlightJS = (code: string): string => {
  try {
    const grammar = (Prism as any)?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

const highlightJSON = (code: string): string => {
  try {
    const grammar = (Prism as any)?.languages?.json;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'json');
  } catch {
    return code;
  }
};

const TransformTestDialog: React.FC<TransformTestDialogProps> = ({
  open,
  onClose,
  title,
  transformCode,
  onTransformCodeChange,
  testInput,
  onTestInputChange,
  testInputLabel,
  testInputPlaceholder,
  testInputRows = 3,
  onTest,
  onApply,
  functionDocumentation,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  const [testLoading, setTestLoading] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    success: boolean;
    result?: any;
    error?: string;
    noTransform?: boolean;
  } | null>(null);
  const [testInputExpanded, setTestInputExpanded] = React.useState(true);
  const [formatError, setFormatError] = React.useState<string | null>(null);

  const formatJson = () => {
    try {
      const parsed = JSON.parse(testInput);
      const formatted = JSON.stringify(parsed, null, 2);
      onTestInputChange(formatted);
      setFormatError(null);
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : 'Invalid JSON');
      setTimeout(() => setFormatError(null), 3000);
    }
  };

  const testTransform = async () => {
    if (!testInput || !testInput.trim()) {
      setTestResult({
        success: false,
        error: `Please provide a ${testInputLabel.toLowerCase()}`,
      });
      return;
    }

    setTestLoading(true);
    try {
      const result = await onTest(transformCode, testInput);
      // Add info if no transform was applied
      if (!transformCode?.trim() && result.success) {
        setTestResult({
          ...result,
          noTransform: true,
        });
      } else {
        setTestResult(result);
      }
    } catch (error) {
      console.error('Error testing transform:', error);
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test transform',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleApply = () => {
    if (onApply) {
      onApply(transformCode);
      onClose();
    }
  };

  // Reset test result when dialog opens
  React.useEffect(() => {
    if (open) {
      setTestResult(null);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          height: '85vh',
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent
        sx={{ display: 'flex', flexDirection: 'column', height: 'calc(85vh - 64px)', p: 2 }}
      >
        <Box sx={{ display: 'flex', gap: 2, flex: 1, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Left side - Input */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: '0 0 58%' }}>
            <Stack spacing={2} sx={{ flex: 1 }}>
              {/* Test Input */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {testInputLabel}
                </Typography>
                <Accordion
                  expanded={testInputExpanded}
                  onChange={(_, isExpanded) => setTestInputExpanded(isExpanded)}
                  sx={{
                    mb: 2,
                    backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        pr: 1,
                      }}
                    >
                      <Typography variant="body2">Test input</Typography>
                      <Tooltip title="Format JSON">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            formatJson();
                          }}
                        >
                          <FormatAlignLeftIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {formatError && (
                      <Alert severity="error" sx={{ mb: 1 }}>
                        {formatError}
                      </Alert>
                    )}
                    <Box
                      sx={{
                        border: 1,
                        borderColor: 'grey.300',
                        borderRadius: 1,
                        backgroundColor: darkMode ? '#1e1e1e' : '#fff',
                      }}
                    >
                      <Editor
                        value={testInput}
                        onValueChange={onTestInputChange}
                        highlight={highlightJSON}
                        padding={10}
                        placeholder={testInputPlaceholder}
                        style={{
                          fontFamily: '"Fira code", "Fira Mono", monospace',
                          fontSize: 14,
                          minHeight: `${testInputRows * 20}px`,
                        }}
                      />
                    </Box>
                  </AccordionDetails>
                </Accordion>
              </Box>

              {/* Transform Code Editor */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Transform Function
                </Typography>
                <Box
                  component="details"
                  sx={{
                    mb: 1,
                    p: 1.5,
                    borderRadius: 1,
                    backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                    '& > summary': {
                      cursor: 'pointer',
                      userSelect: 'none',
                    },
                  }}
                >
                  <Typography component="summary" variant="body2" sx={{ fontWeight: 500 }}>
                    View expected response format
                  </Typography>
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="body2">{functionDocumentation.description}</Typography>
                  </Box>
                </Box>
                <Box
                  component="details"
                  sx={{
                    mb: 2,
                    p: 1.5,
                    borderRadius: 1,
                    backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                    '& > summary': {
                      cursor: 'pointer',
                    },
                  }}
                >
                  <Typography component="summary" variant="body2" sx={{ fontWeight: 500 }}>
                    View function signature
                  </Typography>
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>Function signature:</strong>
                    </Typography>
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        mb: 0,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {functionDocumentation.signature}
                    </Typography>
                  </Box>
                </Box>
                <Box
                  sx={{
                    border: 1,
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    backgroundColor: darkMode ? '#1e1e1e' : '#fff',
                  }}
                >
                  <Editor
                    value={transformCode}
                    onValueChange={onTransformCodeChange}
                    highlight={highlightJS}
                    padding={10}
                    placeholder="Enter transform function"
                    style={{
                      fontFamily: '"Fira code", "Fira Mono", monospace',
                      fontSize: 14,
                      minHeight: '150px',
                    }}
                  />
                </Box>
              </Box>

              {/* Test Button */}
              <Button
                variant="contained"
                onClick={testTransform}
                disabled={testLoading}
                startIcon={<PlayArrowIcon />}
                fullWidth
              >
                Run Test
              </Button>

              {/* Loading */}
              {testLoading && <LinearProgress />}
            </Stack>
          </Box>

          {/* Right side - Result */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2" gutterBottom>
                Result
              </Typography>
              {testResult ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    flex: 1,
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {testResult.success ? (
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {testResult.noTransform ? (
                        <Alert severity="info" sx={{ mb: 2 }}>
                          No transform applied - showing base behavior
                        </Alert>
                      ) : (
                        <Alert severity="success" sx={{ mb: 2 }}>
                          {functionDocumentation.successMessage}
                        </Alert>
                      )}
                      {onApply && !testResult.noTransform && (
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={handleApply}
                          sx={{ mb: 2 }}
                        >
                          Apply Transform
                        </Button>
                      )}
                      <Typography variant="caption" color="text.secondary" gutterBottom>
                        {functionDocumentation.outputLabel}
                      </Typography>
                      <Box
                        sx={{
                          mt: 1,
                          p: 2,
                          backgroundColor: darkMode ? '#1e1e1e' : '#f5f5f5',
                          borderRadius: 1,
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          overflow: 'auto',
                          flex: 1,
                        }}
                      >
                        <Editor
                          value={
                            typeof testResult.result === 'string'
                              ? testResult.result
                              : JSON.stringify(testResult.result, null, 2)
                          }
                          onValueChange={() => {}}
                          highlight={highlightJSON}
                          padding={0}
                          readOnly
                          style={{
                            fontFamily: '"Fira code", "Fira Mono", monospace',
                            fontSize: 14,
                          }}
                        />
                      </Box>
                    </Box>
                  ) : (
                    <Alert severity="error">{testResult.error}</Alert>
                  )}
                </Paper>
              ) : (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography color="text.secondary" align="center">
                    Run the test to see results here
                  </Typography>
                </Paper>
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default TransformTestDialog;
