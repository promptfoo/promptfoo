import React from 'react';

import { callApi } from '@app/utils/api';
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
import dedent from 'dedent';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import type { ProviderOptions } from '@promptfoo/types';

interface RequestTransformTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  defaultRequestTransform?: string;
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

const RequestTransformTab: React.FC<RequestTransformTabProps> = ({
  selectedTarget,
  updateCustomTarget,
  defaultRequestTransform,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  // Test dialog states
  const [testOpen, setTestOpen] = React.useState(false);
  const [testLoading, setTestLoading] = React.useState(false);
  const [testInput, setTestInput] = React.useState('What is the capital of France?');
  const [testResult, setTestResult] = React.useState<{
    success: boolean;
    result?: any;
    error?: string;
  } | null>(null);

  // Editable transform code in modal
  const [editableTransform, setEditableTransform] = React.useState('');

  // Initialize editable code when opening modal
  React.useEffect(() => {
    if (testOpen) {
      setEditableTransform(
        selectedTarget.config?.transformRequest || defaultRequestTransform || '',
      );
    }
  }, [testOpen, selectedTarget.config?.transformRequest, defaultRequestTransform]);

  const testTransform = async () => {
    const transformCode = editableTransform;
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
        error: 'Please provide a test prompt',
      });
      return;
    }

    setTestLoading(true);
    try {
      const response = await callApi('/providers/test-request-transform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transformCode,
          prompt: testInput,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to test transform';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        setTestResult({
          success: false,
          error: errorMessage,
        });
        return;
      }

      const data = await response.json();

      if (data.success) {
        setTestResult({
          success: true,
          result: data.result,
        });
      } else {
        setTestResult({
          success: false,
          error: data.error || 'Transform failed',
        });
      }
    } catch (error) {
      console.error('Error testing request transform:', error);
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test transform',
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Transform the prompt into a specific structure required by your API before sending. See{' '}
        <a href="https://www.promptfoo.dev/docs/providers/http/#request-transform" target="_blank">
          docs
        </a>{' '}
        for more information.
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <Box
          sx={{
            border: 1,
            borderColor: 'grey.300',
            borderRadius: 1,
            backgroundColor: darkMode ? '#1e1e1e' : '#fff',
          }}
        >
          <Editor
            value={selectedTarget.config?.transformRequest || defaultRequestTransform || ''}
            onValueChange={(code) => updateCustomTarget('transformRequest', code)}
            highlight={highlightJS}
            padding={10}
            placeholder={dedent`Optional: A JavaScript expression to transform the prompt before calling the API. Format as:

                      A JSON object with prompt variable: \`{ messages: [{ role: 'user', content: prompt }] }\`
                    `}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              minHeight: '100px',
            }}
          />
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<PlayArrowIcon />}
          onClick={() => {
            setTestResult(null);
            setTestOpen(true);
          }}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
          }}
        >
          Test
        </Button>
      </Box>

      {/* Test Dialog */}
      <Dialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            height: '85vh',
          },
        }}
      >
        <DialogTitle>Test Request Transform</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', height: 'calc(85vh - 64px)', p: 2 }}
        >
          <Box
            sx={{ display: 'flex', gap: 2, flex: 1, flexDirection: { xs: 'column', md: 'row' } }}
          >
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
                      {'(prompt, vars, context) => any'}
                    </Typography>
                    <Typography variant="body2">
                      • <strong>prompt</strong>: string - The test prompt input
                      <br />• <strong>vars</strong>: Record&lt;string, any&gt; - Variables available
                      for substitution
                      <br />• <strong>context</strong>: CallApiContextParams - Additional context
                      (optional)
                    </Typography>
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
                      value={editableTransform}
                      onValueChange={setEditableTransform}
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
                    Test Prompt
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="Enter a test prompt..."
                    variant="outlined"
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
                          Transform executed successfully!
                        </Alert>
                        <Typography variant="caption" color="text.secondary" gutterBottom>
                          Transformed Output:
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
    </>
  );
};

export default RequestTransformTab;
