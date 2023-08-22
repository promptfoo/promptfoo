import React from 'react';
import Editor from 'react-simple-code-editor';
// @ts-ignore: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism.css';
import yaml from 'js-yaml';

import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from 'next/link';

import { useStore } from '@/util/store';

import './YamlEditor.css';

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

  const [code, setCode] = React.useState('');
  const [isReadOnly, setIsReadOnly] = React.useState(true);

  const toggleReadOnly = () => {
    if (!isReadOnly) {
      try {
        const parsed = yaml.load(code, { json: true });
        handleChange(parsed);
      } catch {
        // Invalid YAML, probably mid-edit
      }
    }
    setIsReadOnly(!isReadOnly);
  };

  React.useEffect(() => {
    const testSuite = {
      description,
      providers,
      prompts,
      tests: testCases,
    };

    setCode(yaml.dump(testSuite));
  }, [description, providers, prompts, testCases]);

  const handleChange = (yamlObj: any) => {
    setDescription(yamlObj.description || '');
    setProviders(yamlObj.providers || []);
    setPrompts(yamlObj.prompts || []);
    setTestCases(yamlObj.tests || []);
  };

  return (
    <Box mt={4}>
      <Typography variant="h5" gutterBottom>
        Configuration
      </Typography>
      <Typography variant="body1" gutterBottom>
        This is the YAML config that defines the evaluation and is processed by promptfoo. See{' '}
        <Link target="_blank" href="https://promptfoo.dev/docs/configuration/guide">
          configuration docs
        </Link>{' '}
        to learn more.
      </Typography>
      <Button variant="text" color="primary" startIcon={isReadOnly ? <EditIcon /> : <SaveIcon />} onClick={toggleReadOnly}>
        {isReadOnly ? 'Edit YAML' : 'Save'}
      </Button>
      <Editor
        value={code}
        onValueChange={code => {
          if (!isReadOnly) {
            setCode(code);
          }
        }}
        highlight={code => highlight(code, languages.yaml)}
        padding={10}
        style={{
          fontFamily: '"Fira code", "Fira Mono", monospace',
          fontSize: 12,
        }}
        disabled={isReadOnly}
        className={isReadOnly ? '' : 'glowing-border'}
      />
    </Box>
  );
};

export default YamlEditorComponent;
