import React from 'react';
import YamlEditor from '@focus-reactive/react-yaml';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Link from 'next/link';

interface YamlEditorProps {
  yamlString: string;
  onTestSuiteUpdated: (testSuite: any) => void;
}

const YamlEditorComponent: React.FC<YamlEditorProps> = ({ yamlString, onTestSuiteUpdated }) => {
  const handleChange = ({ json, text }: {json: any, text: string}) => {
    console.log(json);
    onTestSuiteUpdated(json);
  };

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
          <YamlEditor text={yamlString} onChange={handleChange} />
        </Box>
      )}
    </Box>
  );
};

export default YamlEditorComponent;
