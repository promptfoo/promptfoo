import React from 'react';
import YamlEditor from '@focus-reactive/react-yaml';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Link from 'next/link';

import { useStore } from '@/util/store';

const YamlEditorComponent: React.FC = () => {
  const {
    description,
    setDescription,
    providers,
    setProviders,
    prompts,
    setPrompts,
    testCases,
    setTestCases,
  } = useStore();

  const testSuite = {
    description,
    providers,
    prompts,
    tests: testCases,
  };

  const anyNull = (arr: any[]) => arr.some((item) => item == null);

  const handleChange = ({ json, text }: { json: any; text: string }) => {
    setDescription(json.description || '');
    if (!anyNull(json.providers)) {
      setProviders(json.providers || []);
    }
    if (!anyNull(json.prompts)) {
      setPrompts(json.prompts || []);
    }
    if (!anyNull(json.tests)) {
      setTestCases(json.tests || []);
    }
  };

  const handleMerge = ({
    json,
    text,
    currentText,
  }: {
    json: any;
    text: string;
    currentText: string;
  }) => {
    if (!json.providers || !json.prompts || !json.tests) {
      return { text: currentText };
    }
    if (anyNull(json.providers) || anyNull(json.prompts) || anyNull(json.tests)) {
      return { text: currentText };
    }
    return {
      json,
    };
  };

  return (
    <Box mt={4}>
      <Typography variant="h5" gutterBottom>
        Configuration
      </Typography>
      <Typography variant="body1" gutterBottom>
        This is the YAML config that defines the evaluation and is processed by promptfoo. See{' '}
        <Link target="_blank" href="https://promptfoo.dev/docs/configuration/guide">configuration docs</Link> to
        learn more.
      </Typography>
      {/* @ts-ignore: Upset with merge, but seems to work just fine. */}
      <YamlEditor json={testSuite} onChange={handleChange} merge={handleMerge} />
    </Box>
  );
};

export default YamlEditorComponent;
