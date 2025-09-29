import React from 'react';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import dedent from 'dedent';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import type { ProviderOptions } from '@promptfoo/types';

interface HttpStatusCodeTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
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

const HttpStatusCodeTab: React.FC<HttpStatusCodeTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  return (
    <>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Customize which HTTP status codes are treated as successful responses. By default accepts
        200-299. See{' '}
        <a href="https://www.promptfoo.dev/docs/providers/http/#error-handling" target="_blank">
          docs
        </a>{' '}
        for more details.
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
          value={selectedTarget.config.validateStatus || ''}
          onValueChange={(code) => updateCustomTarget('validateStatus', code)}
          highlight={highlightJS}
          padding={10}
          placeholder={dedent`Customize HTTP status code validation. Examples:

                      () => true                     // Default: accept all responses - Javascript function
                      status >= 200 && status < 300  // Accept only 2xx codes - Javascript expression
                      (status) => status < 500       // Accept anything but server errors - Javascript function`}
          style={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 14,
            minHeight: '106px',
          }}
        />
      </Box>
    </>
  );
};

export default HttpStatusCodeTab;
