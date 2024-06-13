'use client';

import React from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';

import RiskCategories from './RiskCategories';
import Overview from './Overview';
import TestSuites from './TestSuites';
import { getApiBaseUrl } from '@/api';

import type { ResultsFile, SharedResults } from '../eval/types';

import './Report.css';
import { categoryAliases, categoryAliasesReverse } from './constants';

const App: React.FC = () => {
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const [evalData, setEvalData] = React.useState<ResultsFile | null>(null);

  React.useEffect(() => {
    const fetchEvalById = async (id: string) => {
      const resp = await fetch(`${await getApiBaseUrl()}/api/results/${id}`, {
        cache: 'no-store',
      });
      const body = (await resp.json()) as SharedResults;
      setEvalData(body.data);
    };

    const searchParams = new URLSearchParams(window.location.search);
    const evalId = searchParams.get('evalId');
    if (evalId) {
      setEvalId(evalId);
      fetchEvalById(evalId);
    }
  }, []);

  if (!evalData || !evalId) {
    return <div>Loading...</div>;
  }

  const prompt = evalData.results.table.head.prompts[0];
  const tableData = evalData.results.table.body;

  const categoryStats = evalData.results.results.reduce(
    (acc, row) => {
      const category =
        row.vars['harmCategory'] ||
        row.gradingResult?.componentResults?.find((result) => result.assertion?.metric)?.assertion
          ?.metric;
      const label = categoryAliasesReverse[category as keyof typeof categoryAliases];
      if (!label) {
        console.log(
          'Unknown harm category:',
          category,
          'for',
          row.vars['harmCategory'] || row.gradingResult?.assertion?.metric,
        );
        return acc;
      }

      const pass = row.success;
      acc[label] = acc[label] || { pass: 0, total: 0 };
      acc[label].total++;
      if (pass) {
        acc[label].pass++;
      }
      return acc;
    },
    {} as Record<string, { pass: number; total: number }>,
  );

  return (
    <Container>
      <Grid container direction="column" spacing={1} pt={6} pb={8}>
        <Grid item className="report-header">
          <Typography variant="h4">
            <strong>LLM Risk Report</strong>
            {evalData.config.description && `: ${evalData.config.description}`}
          </Typography>
          <Typography variant="subtitle1" mb={2}>
            {new Date(evalData.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Typography>
          <Typography variant="body1" gutterBottom className="report-details">
            <Chip
              size="small"
              label={
                <>
                  <strong>Model:</strong> {prompt.provider}
                </>
              }
            />
            <Chip
              size="small"
              label={
                <>
                  <strong>Dataset:</strong> {tableData.length} probes
                </>
              }
            />
            <Chip
              size="small"
              label={
                <>
                  <strong>Prompt:</strong> &quot;
                  {prompt.raw.length > 20 ? `${prompt.raw.substring(0, 20)}...` : prompt.raw}&quot;
                </>
              }
            />
          </Typography>
        </Grid>
        <Grid item>
          <Overview categoryStats={categoryStats} />
        </Grid>
        <Grid item>
          <RiskCategories categoryStats={categoryStats} />
        </Grid>
        <Grid item>
          <TestSuites evalId={evalId} categoryStats={categoryStats} />
        </Grid>
        {/*
        <Grid item>
          <Vulnerabilities />
        </Grid>
            */}
      </Grid>
    </Container>
  );
};

export default App;
