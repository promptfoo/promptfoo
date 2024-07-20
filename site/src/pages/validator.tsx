import { Editor } from '@monaco-editor/react';
import React, { useState, useEffect } from 'react';
import { Box, Container, Typography, Paper, Grid } from '@mui/material';
import Layout from '@theme/Layout';
import Ajv from 'ajv';
import yaml from 'js-yaml';

const ConfigValidator = () => {
  const [input, setInput] = useState('');
  const [validationOutput, setValidationOutput] = useState('');
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

      const ajv = new Ajv();
      const validate = ajv.compile(schema);
      const valid = validate(parsedConfig);

      if (valid) {
        setValidationOutput('Configuration is valid.');
      } else {
        const errorsByPath = validate.errors.reduce<Record<string, string[]>>((acc, error) => {
          const path = error.instancePath || 'root';
          if (!acc[path]) {
            acc[path] = [];
          }
          acc[path].push(error.message);
          return acc;
        }, {});

        const formattedErrors = Object.entries(errorsByPath)
          .map(([path, messages]) => {
            const location = path === 'root' ? 'In root' : `At ${path}`;
            return `• ${location}:\n  ${messages.join('\n  ')}`;
          })
          .join('\n\n');

        setValidationOutput(`Validation errors:\n\n${formattedErrors}`);
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
            Enter your YAML or JSON configuration below to validate it against the schema.
          </Typography>
        </Box>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ height: '500px' }}>
              <Editor
                height="100%"
                defaultLanguage="yaml"
                value={input}
                onChange={handleEditorChange}
                options={{ minimap: { enabled: false } }}
              />
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ height: '500px', p: 2, overflow: 'auto' }}>
              <pre>{validationOutput}</pre>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Layout>
  );
};

export default ConfigValidator;
