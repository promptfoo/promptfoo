import React from 'react';

import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
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
  } | null>(null);

  const testTransform = async () => {
    if (!transformCode) {
      setTestResult({
        success: false,
        error: 'No transform function provided',
      });
      return;
    }

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
      setTestResult(result);
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
              {/* Transform Code Editor */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Transform Function
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Function signature:</strong>
                  </Typography>
                  <Typography
                    variant="body2"
                    component="pre"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      mb: 1,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {functionDocumentation.signature}
                  </Typography>
                  <Typography variant="body2">{functionDocumentation.description}</Typography>
                </Alert>
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
                    placeholder="Enter transform function..."
                    style={{
                      fontFamily: '"Fira code", "Fira Mono", monospace',
                      fontSize: 14,
                      minHeight: '150px',
                    }}
                  />
                </Box>
              </Box>

              {/* Test Input */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {testInputLabel}
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={testInputRows}
                  value={testInput}
                  onChange={(e) => onTestInputChange(e.target.value)}
                  placeholder={testInputPlaceholder}
                  variant="outlined"
                  sx={{
                    fontFamily: testInputRows > 3 ? 'monospace' : undefined,
                    '& textarea': {
                      fontFamily:
                        testInputRows > 3 ? '"Fira code", "Fira Mono", monospace' : undefined,
                      fontSize: testInputRows > 3 ? '0.875rem' : undefined,
                    },
                  }}
                />
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
                      <Alert severity="success" sx={{ mb: 2 }}>
                        {functionDocumentation.successMessage}
                      </Alert>
                      {onApply && (
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
