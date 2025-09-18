import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
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

const RequestTransformTab: React.FC<RequestTransformTabProps> = ({
  selectedTarget,
  updateCustomTarget,
  defaultRequestTransform,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  return (
    <>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Transform the prompt into a specific structure required by your API before sending.
        See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#request-transform"
          target="_blank"
        >
          docs
        </a>{' '}
        for more information.
      </Typography>
      <Box
        sx={{
          border: 1,
          borderColor: 'grey.300',
          borderRadius: 1,
          position: 'relative',
          backgroundColor: darkMode ? '#1e1e1e' : '#fff',
        }}
      >
        <Editor
          value={selectedTarget.config.transformRequest || defaultRequestTransform || ''}
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
    </>
  );
};

export default RequestTransformTab;