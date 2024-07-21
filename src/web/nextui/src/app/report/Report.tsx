'use client';

import React from 'react';
import { getApiBaseUrl } from '@/api';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import type { ResultsFile, SharedResults } from '../eval/types';
import Overview from './Overview';
import RiskCategories from './RiskCategories';
import TestSuites from './TestSuites';
import { categoryAliases, categoryAliasesReverse } from './constants';
import './Report.css';

const theme = (darkMode: boolean) =>
  createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: '#3f51b5',
      },
      secondary: {
        main: '#f50057',
      },
      background: {
        default: darkMode ? '#303030' : '#f5f5f5',
      },
    },
    typography: {
      fontFamily: 'inherit',
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#121212' : '#fff',
            boxShadow: darkMode ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            borderRadius: '12px',
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#121212' : '#fff',
            boxShadow: darkMode ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            borderRadius: '12px',
          },
        },
      },
    },
  });

const App: React.FC = () => {
  const darkMode = useTheme().palette.mode === 'dark';
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
    if (!searchParams) {
      return;
    }
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
      const harm = row.vars['harmCategory'];
      const metricNames =
        row.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];

      const categoriesToCount = [harm, ...metricNames].filter((c) => c);
      for (const category of categoriesToCount) {
        const pluginName = categoryAliasesReverse[category as keyof typeof categoryAliases];
        if (!pluginName) {
          console.log('Unknown harm category:', category);
          return acc;
        }

        const pass = row.success;
        acc[pluginName] = acc[pluginName] || { pass: 0, total: 0, passWithFilter: 0 };
        acc[pluginName].total++;
        if (pass) {
          acc[pluginName].pass++;
          acc[pluginName].passWithFilter++;
        } else if (
          row.gradingResult?.componentResults?.some((result) => {
            const isModeration = result.assertion?.type === 'moderation';
            const isNotPass = !result.pass;
            return isModeration && isNotPass;
          })
        ) {
          acc[pluginName].passWithFilter++;
        }
      }
      return acc;
    },
    {} as Record<string, { pass: number; total: number; passWithFilter: number }>,
  );

  return (
    <ThemeProvider theme={theme.bind(null, darkMode)}>
      <CssBaseline />
      <Container>
        <Stack spacing={4} pb={8} pt={2}>
          <Card className="report-header">
            <Typography variant="h4">
              <strong>LLM Risk Assessment</strong>
              {evalData.config.description && `: ${evalData.config.description}`}
            </Typography>
            <Typography variant="subtitle1" mb={2}>
              {new Date(evalData.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Typography>
            <Box className="report-details">
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
                    {prompt.raw.length > 20 ? `${prompt.raw.substring(0, 20)}...` : prompt.raw}
                    &quot;
                  </>
                }
              />
            </Box>
          </Card>
          <Overview categoryStats={categoryStats} />
          <RiskCategories categoryStats={categoryStats} />
          <TestSuites evalId={evalId} categoryStats={categoryStats} />
          {/*
        <div>
          <Vulnerabilities />
        </div>
            */}
        </Stack>
      </Container>
    </ThemeProvider>
  );
};

export default App;
