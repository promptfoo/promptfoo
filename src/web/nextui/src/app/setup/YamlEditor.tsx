import React from 'react';
import Editor from 'react-simple-code-editor';
import { useStore } from '@/state/evalConfig';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import yaml from 'js-yaml';
import Link from 'next/link';
// @ts-ignore: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-yaml';
import './YamlEditor.css';
import 'prismjs/themes/prism.css';

const YamlEditorComponent: React.FC = () => {
  const {
    defaultTest,
    setDefaultTest,
    description,
    setDescription,
    env,
    setEnv,
    evaluateOptions,
    setEvaluateOptions,
    prompts,
    setPrompts,
    providers,
    setProviders,
    scenarios,
    setScenarios,
    testCases,
    setTestCases,
  } = useStore();

  const [code, setCode] = React.useState('');
  const [isReadOnly, setIsReadOnly] = React.useState(true);

  const handleChange = (yamlObj: any) => {
    setDefaultTest(yamlObj.defaultTest || {});
    setDescription(yamlObj.description || '');
    setEnv(yamlObj.env || {});
    setEvaluateOptions(yamlObj.evaluateOptions || {});
    setPrompts(yamlObj.prompts || []);
    setProviders(yamlObj.providers || []);
    setScenarios(yamlObj.scenarios || []);
    setTestCases(yamlObj.tests || []);
  };

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
      defaultTest,
      description,
      env,
      evaluateOptions,
      prompts,
      providers,
      scenarios,
      tests: testCases,
    };

    setCode(yaml.dump(testSuite));
  }, [defaultTest, description, env, evaluateOptions, prompts, providers, scenarios, testCases]);

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
      <Button
        variant="text"
        color="primary"
        startIcon={isReadOnly ? <EditIcon /> : <SaveIcon />}
        onClick={toggleReadOnly}
      >
        {isReadOnly ? 'Edit YAML' : 'Save'}
      </Button>
      <Editor
        autoCapitalize="off"
        value={code}
        onValueChange={(code) => {
          if (!isReadOnly) {
            setCode(code);
          }
        }}
        highlight={(code) => highlight(code, languages.yaml)}
        padding={10}
        style={{
          backgroundColor: '#fff',
          fontFamily: '"Fira code", "Fira Mono", monospace',
          fontSize: 14,
        }}
        disabled={isReadOnly}
        className={isReadOnly ? '' : 'glowing-border'}
      />
    </Box>
  );
};

export default YamlEditorComponent;
