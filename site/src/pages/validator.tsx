import { Editor } from '@monaco-editor/react';
import React, { useState, useEffect } from 'react';
import Link from '@docusaurus/Link';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { AggregateAjvError } from '@segment/ajv-human-errors';
import Layout from '@theme/Layout';
import Ajv from 'ajv';
import yaml from 'js-yaml';

const DEFAULT_INPUT = `prompts:
  - "Write a tweet about {{topic}}"

providers:
  - openai:chat:gpt-4o-mini
  - anthropic:messages:claude-3-5-sonnet-20241022

tests:
  - vars:
      topic: bananas
    assert:
      - type: contains
        value: "banana"
  - vars:
      topic: pineapples
    assert:
      - type: llm-rubric
        value: "mentions health benefits"
        
defaultTest:
  assert:
    - type: javascript
      value: "output.length <= 280"
`;

const ConfigValidator = () => {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [validationOutput, setValidationOutput] = useState('Configuration is valid');
  const [schema, setSchema] = useState(null);

  useEffect(() => {
    fetch('/config-schema.json')
      .then((response) => response.json())
      .then((data) => setSchema(data))
      .catch((error) => console.error('Error loading schema:', error));
  }, []);

  const validateConfig = (value) => {
    if (!schema) {
      setValidationOutput('Schema not loaded yet.');
      return;
    }

    try {
      let parsedConfig;
      if (value.trim().startsWith('{')) {
        parsedConfig = JSON.parse(value);
      } else {
        parsedConfig = yaml.load(value);
      }

      const ajv = new Ajv({
        allErrors: false,
        verbose: true,
      });

      ajv.validate(schema, parsedConfig);

      const errors = new AggregateAjvError(ajv.errors);
      const errorsByPath: Record<string, string[]> = {};

      for (const error of Array.from(errors)) {
        if (!errorsByPath[error.path]) {
          errorsByPath[error.path] = [];
        }
        errorsByPath[error.path].push(error.message);
      }

      if (Object.keys(errorsByPath).length === 0) {
        setValidationOutput('Configuration is valid.');
      } else {
        let output = 'Validation errors:\n\n';
        // Only show the deepest errors for each path, otherwise it's too verbose
        const deepestPaths = Object.keys(errorsByPath).filter(
          (path) =>
            !Object.keys(errorsByPath).some(
              (otherPath) => otherPath !== path && otherPath.startsWith(path),
            ),
        );
        for (const path of deepestPaths) {
          output += `${path}:\n`;
          errorsByPath[path].forEach((message) => {
            output += `  - ${message}\n`;
          });
          output += '\n';
        }
        setValidationOutput(output.trim());
      }
    } catch (error) {
      setValidationOutput(`Error parsing input: ${error.message}`);
    }
  };

  const handleEditorChange = (value) => {
    setInput(value);
    validateConfig(value);
  };

  return (
    <Layout title="Config Validator" description="Validate your promptfoo configuration">
      <Container maxWidth="lg" sx={{ mb: 4 }}>
        <Box sx={{ my: 4 }}>
          <Typography variant="h3" gutterBottom align="center">
            Promptfoo Config Validator
          </Typography>
          <Typography variant="body1" gutterBottom align="center">
            Enter your YAML or JSON configuration below to validate it against the{' '}
            <Link to="https://github.com/promptfoo/promptfoo/blob/main/site/static/config-schema.json">
              schema
            </Link>
            .
          </Typography>
        </Box>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ height: '80vh' }}>
              <Editor
                height="100%"
                defaultLanguage="yaml"
                value={input}
                onChange={handleEditorChange}
                options={{ tabSize: 2, minimap: { enabled: false } }}
              />
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ height: '80vh', p: 2, overflow: 'auto' }}>
              <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                {validationOutput}
              </pre>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Layout>
  );
};

export default ConfigValidator;
