import React from 'react';
import { callApi } from '@app/utils/api';
import WarningIcon from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Modal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type {
  EvaluateResult,
  ResultsFile,
  SharedResults,
  GradingResult,
  ResultLightweightWithLabel,
} from '@promptfoo/types';
import FrameworkCompliance from './FrameworkCompliance';
import Overview from './Overview';
import ReportDownloadButton from './ReportDownloadButton';
import ReportSettingsDialogButton from './ReportSettingsDialogButton';
import RiskCategories from './RiskCategories';
import StrategyStats from './StrategyStats';
import TestSuites from './TestSuites';
import { categoryAliasesReverse, type categoryAliases } from './constants';
import './Report.css';

function getStrategyIdFromMetric(metric: string): string | null {
  const parts = metric.split('/');
  const metricSuffix = parts[1];
  if (metricSuffix) {
    if (metricSuffix === 'Iterative') {
      return 'jailbreak';
    } else if (metricSuffix === 'IterativeTree') {
      return 'jailbreak:tree';
    } else if (metricSuffix === 'Crescendo') {
      return 'crescendo';
    } else if (metricSuffix === 'Injection') {
      return 'prompt-injection';
    } else if (metricSuffix === 'Rot13') {
      return 'rot13';
    } else if (metricSuffix === 'Base64') {
      return 'base64';
    } else if (metricSuffix === 'Leetspeak') {
      return 'leetspeak';
    } else if (metricSuffix.startsWith('Multilingual')) {
      return 'multilingual';
    }
  }
  return null;
}

function getPluginIdFromResult(result: EvaluateResult): string | null {
  // TODO(ian): Need a much easier way to get the pluginId (and strategyId) from a result
  const harmCategory = result.vars['harmCategory'];
  if (harmCategory) {
    return categoryAliasesReverse[harmCategory as keyof typeof categoryAliases];
  }
  const metricNames =
    result.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];
  const metricBaseName = metricNames[0]?.split('/')[0];
  if (metricBaseName) {
    return categoryAliasesReverse[metricBaseName as keyof typeof categoryAliases];
  }
  return null;
}

const App: React.FC = () => {
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const [evalData, setEvalData] = React.useState<ResultsFile | null>(null);
  const [selectedPromptIndex, setSelectedPromptIndex] = React.useState(0);
  const [isPromptModalOpen, setIsPromptModalOpen] = React.useState(false);

  React.useEffect(() => {
    const fetchEvalById = async (id: string) => {
      const resp = await callApi(`/results/${id}`, {
        cache: 'no-store',
      });
      const body = (await resp.json()) as SharedResults;
      setEvalData(body.data);
    };

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams) {
      const evalId = searchParams.get('evalId');
      if (evalId) {
        setEvalId(evalId);
        fetchEvalById(evalId);
      } else {
        // Need to fetch the latest evalId from the server
        const fetchLatestEvalId = async () => {
          try {
            const resp = await callApi('/results', { cache: 'no-store' });
            if (!resp.ok) {
              console.error('Failed to fetch recent evals');
              return;
            }
            const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
            if (body.data && body.data.length > 0) {
              const latestEvalId = body.data[0].evalId;
              setEvalId(latestEvalId);
              fetchEvalById(latestEvalId);
            } else {
              console.log('No recent evals found');
            }
          } catch (error) {
            console.error('Error fetching latest eval:', error);
          }
        };

        fetchLatestEvalId();
      }
    }
  }, []);

  const failuresByPlugin = React.useMemo(() => {
    const failures: Record<
      string,
      { prompt: string; output: string; gradingResult?: GradingResult }[]
    > = {};
    evalData?.results.results.forEach((result) => {
      const pluginId = getPluginIdFromResult(result);
      if (!pluginId) {
        console.warn(`Could not get failures for plugin ${pluginId}`);
        return;
      }
      if (pluginId && !result.gradingResult?.pass) {
        if (!failures[pluginId]) {
          failures[pluginId] = [];
        }
        failures[pluginId].push({
          // FIXME(ian): Use injectVar (and contextVar), not hardcoded query
          prompt:
            result.vars.query?.toString() || result.vars.prompt?.toString() || result.prompt.raw,
          output: result.response?.output,
          gradingResult: result.gradingResult,
        });
      }
    });
    return failures;
  }, [evalData]);

  React.useEffect(() => {
    document.title = `Report: ${evalData?.config.description || evalId || 'Red Team'} | promptfoo`;
  }, [evalData, evalId]);

  if (!evalData || !evalId) {
    return <Box sx={{ width: '100%', textAlign: 'center' }}>Loading...</Box>;
  }

  if (!evalData.config.redteam) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: 3,
        }}
      >
        <Paper elevation={3} sx={{ padding: 4, maxWidth: 600, textAlign: 'center' }}>
          <WarningIcon color="warning" sx={{ fontSize: 60, marginBottom: 2 }} />
          <Typography variant="h4" mb={3}>
            Report unavailable
          </Typography>
          <Typography variant="body1">
            The latest evaluation results are not displayable in report format.
          </Typography>
          <Typography variant="body1">Please run a red team and try again.</Typography>
        </Paper>
      </Box>
    );
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

  const strategyStats = evalData.results.results.reduce(
    (acc, row) => {
      const metricNames =
        row.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];

      for (const metric of metricNames) {
        if (typeof metric !== 'string') {
          continue;
        }

        let strategyId = getStrategyIdFromMetric(metric);
        if (!strategyId) {
          strategyId = 'basic';
        }

        if (!acc[strategyId]) {
          acc[strategyId] = { pass: 0, total: 0 };
        }

        acc[strategyId].total++;

        const passed = row.gradingResult?.componentResults?.some(
          (result) => result.assertion?.metric === metric && result.pass,
        );

        if (passed) {
          acc[strategyId].pass++;
        }
      }

      return acc;
    },
    {} as Record<string, { pass: number; total: number }>,
  );

  const handlePromptChipClick = () => {
    setIsPromptModalOpen(true);
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
        <FrameworkCompliance categoryStats={categoryStats} strategyStats={strategyStats} />
        <StrategyStats strategyStats={strategyStats} />
        <RiskCategories
          categoryStats={categoryStats}
          evalId={evalId}
          failuresByPlugin={failuresByPlugin}
        />
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
              // @ts-ignore
              <ListItem
                key={index}
                button
                onClick={() => handlePromptSelect(index)}
                selected={index === selectedPromptIndex}
              >
                <ListItemText
                  primary={`${prompt.provider}`}
                  secondary={
                    <pre>
                      {prompt.raw.length > 100 && prompts.length > 1
                        ? `${prompt.raw.substring(0, 100)}...`
                        : prompt.raw}
                    </pre>
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
