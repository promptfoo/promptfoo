import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';

export const MetadataFilterExamples: React.FC = () => {
  const examples = [
    {
      scenario: 'Find all GPT-4 results',
      key: 'model',
      value: 'gpt-4',
      result: 'Shows only results where model = "gpt-4"',
    },
    {
      scenario: 'Find all results with any model',
      key: 'model',
      value: '',
      result: 'Shows all results that have a "model" metadata key',
    },
    {
      scenario: 'Find all composite strategies',
      key: 'strategy',
      value: 'composite',
      result: 'Shows only results where strategy = "composite"',
    },
    {
      scenario: 'Find strategies starting with "comp"',
      key: 'strategy',
      value: 'comp*',
      result: 'Shows results where strategy starts with "comp" (composite, complex, etc.)',
    },
    {
      scenario: 'Find models containing "3.5"',
      key: 'model',
      value: '*3.5*',
      result: 'Shows results where model contains "3.5" (gpt-3.5-turbo, claude-3.5-sonnet, etc.)',
    },
    {
      scenario: 'Find strategies ending with "site"',
      key: 'strategy',
      value: '*site',
      result: 'Shows results where strategy ends with "site" (composite, opposite, etc.)',
    },
  ];

  return (
    <Paper elevation={0} sx={{ p: 2, backgroundColor: 'background.default' }}>
      <Typography variant="h6" gutterBottom>
        Metadata Filter Examples
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Scenario</TableCell>
              <TableCell>Key</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Result</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {examples.map((example, index) => (
              <TableRow key={index}>
                <TableCell>{example.scenario}</TableCell>
                <TableCell>
                  <Chip label={example.key} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  {example.value ? (
                    <Chip label={example.value} size="small" color="primary" variant="outlined" />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      (empty)
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {example.result}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Tips:</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary" component="ul" sx={{ mt: 0.5 }}>
          <li>Use wildcards (*) for flexible matching</li>
          <li>Press Enter to apply the filter</li>
          <li>Click the clear button (×) to remove the value filter</li>
          <li>The filter applies to the entire evaluation dataset, not just the current page</li>
        </Typography>
      </Box>
    </Paper>
  );
}; 