'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import yaml from 'js-yaml';
import {
  categoryAliases,
  riskCategories,
  displayNameOverrides,
  subCategoryDescriptions,
} from '../report/constants';
import './page.css';

// Constants recreated from redteam/constants.ts
const DEFAULT_PLUGINS = new Set([
  'harmful',
  'pii',
  'default',
  'contracts',
  'excessive-agency',
  'hallucination',
  'hijacking',
  'overreliance',
  'politics',
  'harmful:violent-crime',
  'harmful:non-violent-crime',
  'harmful:sex-crime',
  'harmful:child-exploitation',
  'harmful:indiscriminate-weapons',
  'harmful:hate',
  'harmful:self-harm',
  'harmful:sexual-content',
  'harmful:privacy',
  'harmful:intellectual-property',
  'harmful:misinformation-disinformation',
  'harmful:specialized-advice',
  'pii:api-db',
  'pii:direct',
  'pii:session',
  'pii:social',
]);

const ADDITIONAL_PLUGINS = [
  'bola',
  'bfla',
  'competitors',
  'debug-access',
  'imitation',
  'rbac',
  'ssrf',
  'shell-injection',
  'sql-injection',
];

const CONFIG_REQUIRED_PLUGINS = ['policy'];

const ALL_PLUGINS = [
  ...new Set([...DEFAULT_PLUGINS, ...ADDITIONAL_PLUGINS, ...CONFIG_REQUIRED_PLUGINS]),
].sort();

const DEFAULT_STRATEGIES = ['jailbreak', 'prompt-injection'];

const ALL_STRATEGIES = [
  'basic',
  'default',
  ...DEFAULT_STRATEGIES,
  'jailbreak:tree',
  'rot13',
  'base64',
  'leetspeak',
];

const SetupRedTeam = () => {
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>(Array.from(DEFAULT_PLUGINS));
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([...DEFAULT_STRATEGIES]);
  const [numTests, setNumTests] = useState<number>(5);
  const [language, setLanguage] = useState<string>('English');
  const [purpose, setPurpose] = useState<string>(
    'Helpful customer service chatbot for Wayne Enterprises',
  );

  const handlePluginChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setSelectedPlugins((prev) =>
      checked ? [...prev, name] : prev.filter((plugin) => plugin !== name),
    );
  };

  const handleStrategyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setSelectedStrategies((prev) =>
      checked ? [...prev, name] : prev.filter((strategy) => strategy !== name),
    );
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [yamlConfig, setYamlConfig] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const config = {
      prompts: [
        `You are a helpful concise assistant.\n\nUser query: {{query}}\n\nPurpose: ${purpose}`,
      ],
      providers: ['openai:gpt-4o-mini'],
      tests: [],
      redteam: {
        plugins: selectedPlugins,
        strategies: selectedStrategies,
        numTests,
      },
    };
    const yamlString = yaml.dump(config);
    setYamlConfig(yamlString);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(yamlConfig);
  };

  // Group plugins by category
  const groupedPlugins = Object.entries(riskCategories).reduce(
    (acc, [category, plugins]) => {
      acc[category] = plugins.filter((plugin) => ALL_PLUGINS.includes(plugin));
      return acc;
    },
    {} as Record<string, string[]>,
  );

  return (
    <Paper elevation={3} className="setup-redteam-container">
      <Typography variant="h4" gutterBottom className="page-title">
        Set Up Red Team Evaluation
      </Typography>

      <Grid container spacing={3} component="form" onSubmit={handleSubmit}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Number of Tests"
            type="number"
            value={numTests}
            onChange={(e) => setNumTests(Number(e.target.value))}
            inputProps={{ min: 1 }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            multiline
            rows={3}
          />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom className="section-title">
            Plugins
          </Typography>
          <Paper elevation={1} className="plugins-container">
            {Object.entries(groupedPlugins).map(([category, plugins]) => (
              <Box key={category} className="plugin-category">
                <Typography variant="subtitle1" gutterBottom>
                  {category}
                </Typography>
                <FormGroup>
                  {plugins.map((plugin) => (
                    <FormControlLabel
                      key={plugin}
                      control={
                        <Checkbox
                          checked={selectedPlugins.includes(plugin)}
                          onChange={handlePluginChange}
                          name={plugin}
                        />
                      }
                      label={
                        displayNameOverrides[plugin as keyof typeof displayNameOverrides] ||
                        categoryAliases[plugin as keyof typeof categoryAliases] ||
                        plugin
                      }
                      title={
                        subCategoryDescriptions[plugin as keyof typeof subCategoryDescriptions]
                      }
                    />
                  ))}
                </FormGroup>
              </Box>
            ))}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom className="section-title">
            Strategies
          </Typography>
          <Paper elevation={1} className="strategies-container">
            <FormGroup>
              {ALL_STRATEGIES.map((strategy) => (
                <FormControlLabel
                  key={strategy}
                  control={
                    <Checkbox
                      checked={selectedStrategies.includes(strategy)}
                      onChange={handleStrategyChange}
                      name={strategy}
                    />
                  }
                  label={
                    displayNameOverrides[strategy as keyof typeof displayNameOverrides] ||
                    categoryAliases[strategy as keyof typeof categoryAliases] ||
                    strategy
                  }
                  title={subCategoryDescriptions[strategy as keyof typeof subCategoryDescriptions]}
                />
              ))}
            </FormGroup>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Button type="submit" variant="contained" color="primary" size="large" fullWidth>
            Generate Red Team Evaluation
          </Button>
        </Grid>
      </Grid>

      <Dialog open={isModalOpen} onClose={handleCloseModal} maxWidth="md" fullWidth>
        <DialogTitle>Generated YAML Configuration</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            rows={10}
            value={yamlConfig}
            variant="outlined"
            InputProps={{
              readOnly: true,
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCopyConfig} color="primary">
            Copy to Clipboard
          </Button>
          <Button onClick={handleCloseModal} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default SetupRedTeam;
