import React from 'react';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import dedent from 'dedent';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import type { ProviderOptions } from '@promptfoo/types';

interface ResponseTransformTabProps {
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

const ResponseTransformTab: React.FC<ResponseTransformTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  return (
    <>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Extract specific data from the HTTP response. See{' '}
        <a href="https://www.promptfoo.dev/docs/providers/http/#response-transform" target="_blank">
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
          value={selectedTarget.config.transformResponse || ''}
          onValueChange={(code) => updateCustomTarget('transformResponse', code)}
          highlight={highlightJS}
          padding={10}
          placeholder={dedent`Optional: Transform the API response before using it. Format as either:

                      1. A JavaScript object path: \`json.choices[0].message.content\`
                      2. A function that receives response data: \`(json, text) => json.choices[0].message.content || text\`

                      With guardrails: { output: json.choices[0].message.content, guardrails: { flagged: context.response.status === 500 } }`}
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

export default ResponseTransformTab;
