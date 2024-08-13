'use client';

import React from 'react';
import { getApiBaseUrl } from '@/api';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Modal from '@mui/material/Modal';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ResultsFile, SharedResults } from '../eval/types';
import Overview from './Overview';
import ReportDownloadButton from './ReportDownloadButton';
import ReportSettingsDialogButton from './ReportSettingsDialogButton';
import RiskCategories from './RiskCategories';
import TestSuites from './TestSuites';
import type { categoryAliases } from './constants';
import { categoryAliasesReverse } from './constants';
import './Report.css';

const App: React.FC = () => {
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const [evalData, setEvalData] = React.useState<ResultsFile | null>(null);
  const [selectedPromptIndex, setSelectedPromptIndex] = React.useState(0);
  const [isPromptModalOpen, setIsPromptModalOpen] = React.useState(false);

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

  React.useEffect(() => {
    document.title = `Report: ${evalData?.config.description || evalId || 'Red Team'} | promptfoo`;
  }, [evalData, evalId]);

  if (!evalData || !evalId) {
    return <Box sx={{ width: '100%', textAlign: 'center' }}>Loading...</Box>;
  }

  const prompts = evalData.results.table.head.prompts;
  const selectedPrompt = prompts[selectedPromptIndex];
  const tableData = evalData.results.table.body;

  const categoryStats = evalData.results.results.reduce(
    (acc, row) => {
      const harm = row.vars['harmCategory'];
      const metricNames =
        row.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];

      const categoriesToCount = [harm, ...metricNames].filter((c) => c);
      for (const category of categoriesToCount) {
        if (typeof category !== 'string') {
          continue;
        }
        const pluginName =
          categoryAliasesReverse[category.split('/')[0] as keyof typeof categoryAliases];
        if (!pluginName) {
          console.log('Unknown harm category:', category);
          return acc;
        }

        const rowPassedModeration = row.gradingResult?.componentResults?.some((result) => {
          const isModeration = result.assertion?.type === 'moderation';
          const isPass = result.pass;
          return isModeration && isPass;
        });
        const rowPassedLlmRubric = row.gradingResult?.componentResults?.some((result) => {
          const isLlmRubric =
            result.assertion?.type === 'llm-rubric' ||
            result.assertion?.type.startsWith('promptfoo:redteam');
          const isPass = result.pass;
          return isLlmRubric && isPass;
        });
        const rowPassedHuman = row.gradingResult?.componentResults?.some((result) => {
          const isHuman = result.assertion?.type === 'human';
          const isPass = result.pass;
          return isHuman && isPass;
        });

        acc[pluginName] = acc[pluginName] || { pass: 0, total: 0, passWithFilter: 0 };
        acc[pluginName].total++;
        if (rowPassedLlmRubric || rowPassedHuman) {
          // Note: We count the row as passed if it passed the LLM rubric or human, even if it failed moderation
          acc[pluginName].pass++;
          acc[pluginName].passWithFilter++;
        } else if (!rowPassedModeration) {
          acc[pluginName].passWithFilter++;
        }
      }
      return acc;
    },
    {} as Record<string, { pass: number; total: number; passWithFilter: number }>,
  );

  const handlePromptChipClick = () => {
    if (prompts.length > 1) {
      setIsPromptModalOpen(true);
    }
  };

  const handlePromptSelect = (index: number) => {
    setSelectedPromptIndex(index);
    setIsPromptModalOpen(false);
  };

  return (
    <Container>
      <Stack spacing={4} pb={8} pt={2}>
        <Card className="report-header" sx={{ position: 'relative' }}>
          <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex' }}>
            <ReportDownloadButton evalDescription={evalData.config.description || evalId} />
            <ReportSettingsDialogButton />
          </Box>
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
                  <strong>Model:</strong> {selectedPrompt.provider}
                </>
              }
              onClick={handlePromptChipClick}
              style={{ cursor: prompts.length > 1 ? 'pointer' : 'default' }}
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
                  {selectedPrompt.raw.length > 40
                    ? `${selectedPrompt.raw.substring(0, 40)}...`
                    : selectedPrompt.raw}
                  &quot;
                </>
              }
              onClick={handlePromptChipClick}
              style={{ cursor: prompts.length > 1 ? 'pointer' : 'default' }}
            />
          </Box>
        </Card>
        <Overview categoryStats={categoryStats} />
        <RiskCategories categoryStats={categoryStats} />
        <TestSuites evalId={evalId} categoryStats={categoryStats} />
      </Stack>
      <Modal
        open={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        aria-labelledby="prompt-modal-title"
        sx={{
          '& .MuiModal-root': {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
          '& .MuiBox-root': {
            width: '80%',
            maxWidth: 800,
            maxHeight: '90vh',
            overflowY: 'auto',
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400,
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
          }}
        >
          <Typography id="prompt-modal-title" variant="h6" component="h2" gutterBottom>
            View results for...
          </Typography>
          <List>
            {prompts.map((prompt, index) => (
              <ListItem
                key={index}
                button
                onClick={() => handlePromptSelect(index)}
                selected={index === selectedPromptIndex}
              >
                <ListItemText
                  primary={`${prompt.provider}`}
                  secondary={
                    prompt.raw.length > 100 ? `${prompt.raw.substring(0, 100)}...` : prompt.raw
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </Modal>
    </Container>
  );
};

export default App;
