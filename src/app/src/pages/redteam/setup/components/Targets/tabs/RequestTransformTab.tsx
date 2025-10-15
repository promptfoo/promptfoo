import React from 'react';

import { callApi } from '@app/utils/api';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import dedent from 'dedent';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import TransformTestDialog from '../TransformTestDialog';
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

const RequestTransformTab: React.FC<RequestTransformTabProps> = ({
  selectedTarget,
  updateCustomTarget,
  defaultRequestTransform,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  // Test dialog states
  const [testOpen, setTestOpen] = React.useState(false);
  const [testInput, setTestInput] = React.useState('What is the capital of France?');

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

  // Test handler function
  const handleTest = async (transformCode: string, testInput: string) => {
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
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        result: data.result,
      };
    } else {
      return {
        success: false,
        error: data.error || 'Transform failed',
      };
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
            placeholder={dedent`Optional: A JavaScript expression to transform the prompt before calling the API.

                      Example: { messages: [{ role: 'user', content: prompt }] }
                      
                      Leave empty to send the prompt as-is.
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
          onClick={() => setTestOpen(true)}
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

      <TransformTestDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Test Request Transform"
        transformCode={editableTransform}
        onTransformCodeChange={setEditableTransform}
        testInput={testInput}
        onTestInputChange={setTestInput}
        testInputLabel="Test Prompt"
        testInputPlaceholder="Enter a test prompt..."
        testInputRows={3}
        onTest={handleTest}
        onApply={(code) => updateCustomTarget('transformRequest', code)}
        functionDocumentation={{
          signature:
            '(prompt: string, vars: Record<string, any>, context: CallApiContextParams) => string | object',
          description: (
            <>
              • <strong>prompt</strong>: string - The test prompt input
              <br />• <strong>vars</strong>: Record&lt;string, any&gt; - Variables available for
              substitution
              <br />• <strong>context</strong>: CallApiContextParams - Additional context (optional)
            </>
          ),
          successMessage: 'Transform executed successfully!',
          outputLabel: 'Transformed Output:',
        }}
      />
    </>
  );
};

export default RequestTransformTab;
