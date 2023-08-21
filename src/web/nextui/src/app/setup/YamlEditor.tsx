import React from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/cjs/styles/hljs';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Link from 'next/link';

interface YamlEditorProps {
  yamlString: string;
}

const YamlEditor: React.FC<YamlEditorProps> = ({ yamlString }) => {
  return (
    <Box mt={8}>
      {yamlString && (
        <Box mt={4}>
          <Typography variant="h5" gutterBottom>
            YAML config
          </Typography>
          <Typography variant="body1" gutterBottom>
            This is the evaluation config that is run by promptfoo. See{' '}
            <Link href="https://promptfoo.dev/docs/configuration/guide">configuration docs</Link>{' '}
            to learn more.
          </Typography>
          <SyntaxHighlighter className="yaml-config" language="yaml" style={docco}>
            {yamlString}
          </SyntaxHighlighter>
        </Box>
      )}
    </Box>
  );
};

export default YamlEditor;
