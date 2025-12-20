import React from 'react';

import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PrintIcon from '@mui/icons-material/Print';
import WarningIcon from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Paper';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  type EvaluateResult,
  type EvaluateSummaryV2,
  type GradingResult,
  isProviderOptions,
  ResultFailureReason,
  type ResultLightweightWithLabel,
  type ResultsFile,
  type SharedResults,
} from '@promptfoo/types';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import { useNavigate } from 'react-router-dom';
import FrameworkCompliance from './FrameworkCompliance';
import Overview from './Overview';
import './Report.css';

import { type GridFilterModel, GridLogicOperator } from '@mui/x-data-grid';
import { type CategoryStats, type TestResultStats } from './FrameworkComplianceUtils';
import ReportDownloadButton from './ReportDownloadButton';
import ReportSettingsDialogButton from './ReportSettingsDialogButton';
import RiskCategories from './RiskCategories';
import StrategyStats from './StrategyStats';
import { getPluginIdFromResult, getStrategyIdFromTest } from './shared';
import TestSuites from './TestSuites';
import ToolsDialog from './ToolsDialog';

const App = () => {
  const navigate = useNavigate();
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const [evalData, setEvalData] = React.useState<ResultsFile | null>(null);
  const [selectedPromptIndex, setSelectedPromptIndex] = React.useState(0);
  const [isToolsDialogOpen, setIsToolsDialogOpen] = React.useState(false);
  const { recordEvent } = useTelemetry();

  const [isFiltersVisible, setIsFiltersVisible] = React.useState(false);
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const [selectedStrategies, setSelectedStrategies] = React.useState<string[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pass' | 'fail'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  // Scroll tracking for persistent header
  const [isScrolled, setIsScrolled] = React.useState(false);

  // Vulnerabilities DataGrid
  const vulnerabilitiesDataGridRef = React.useRef<HTMLDivElement>(null);
  const [vulnerabilitiesDataGridFilterModel, setVulnerabilitiesDataGridFilterModel] =
    React.useState<GridFilterModel>({
      items: [],
      logicOperator: GridLogicOperator.Or,
    });

  const searchParams = new URLSearchParams(window.location.search);
  React.useEffect(() => {
    const fetchEvalById = async (id: string) => {
      const resp = await callApi(`/results/${id}`, {
        cache: 'no-store',
      });
      const body = (await resp.json()) as SharedResults;
      setEvalData(body.data);

      // Track funnel event for report viewed
      recordEvent('funnel', {
        type: 'redteam',
        step: 'webui_report_viewed',
        source: 'webui',
        evalId: id,
      });
    };

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

  // Track scroll position for persistent header visibility
  React.useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 200;
      setIsScrolled(window.scrollY > scrollThreshold);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const failuresByPlugin = React.useMemo(() => {
    if (!evalData) {
      return {};
    }

    const prompts =
      (evalData.version >= 4
        ? evalData.prompts
        : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
    const selectedPrompt = prompts[selectedPromptIndex];

    const failures: Record<
      string,
      { prompt: string; output: string; gradingResult?: GradingResult; result?: EvaluateResult }[]
    > = {};
    evalData?.results.results.forEach((result) => {
      // Filter by selected target/provider if multiple targets exist
      if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
        return;
      }

      const pluginId = getPluginIdFromResult(result);
      if (!pluginId) {
        console.warn(`Could not get failures for plugin ${pluginId}`);
        return;
      }

      // Exclude results with errors from being counted as failures
      // TODO: Errors which arise while grading may be mis-classified as ResultFailureReason.ASSERT
      // and leak past this check. Check `result.gradingResult.reason` for errors e.g. "API call error: *".
      if (result.error && result.failureReason === ResultFailureReason.ERROR) {
        return;
      }

      if (!result.success || !result.gradingResult?.pass) {
        if (!failures[pluginId]) {
          failures[pluginId] = [];
        }
        // Backwards compatibility for old evals that used 'query' instead of 'prompt'. 2024-12-12
        const injectVar = evalData.config.redteam?.injectVar ?? 'prompt';
        const injectVarValue =
          result.vars[injectVar]?.toString() || result.vars['query']?.toString();
        failures[pluginId].push({
          prompt: injectVarValue || result.prompt.raw,
          output: result.response?.output,
          gradingResult: result.gradingResult || undefined,
          result,
        });
      }
    });
    return failures;
  }, [evalData, selectedPromptIndex]);

  const passesByPlugin = React.useMemo(() => {
    if (!evalData) {
      return {};
    }

    const prompts =
      (evalData.version >= 4
        ? evalData.prompts
        : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
    const selectedPrompt = prompts[selectedPromptIndex];

    const passes: Record<
      string,
      { prompt: string; output: string; gradingResult?: GradingResult; result?: EvaluateResult }[]
    > = {};
    evalData?.results.results.forEach((result) => {
      // Filter by selected target/provider if multiple targets exist
      if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
        return;
      }

      const pluginId = getPluginIdFromResult(result);
      if (!pluginId) {
        console.warn(`Could not get passes for plugin ${pluginId}`);
        return;
      }

      // Exclude results with errors from being counted
      if (result.error && result.failureReason === ResultFailureReason.ERROR) {
        return;
      }

      if (result.success && result.gradingResult?.pass) {
        if (!passes[pluginId]) {
          passes[pluginId] = [];
        }
        passes[pluginId].push({
          prompt:
            result.vars.query?.toString() || result.vars.prompt?.toString() || result.prompt.raw,
          output: result.response?.output,
          gradingResult: result.gradingResult || undefined,
          result,
        });
      }
    });
    return passes;
  }, [evalData, selectedPromptIndex]);

  const categoryStats = React.useMemo(() => {
    if (!evalData) {
      return {};
    }

    const prompts =
      (evalData.version >= 4
        ? evalData.prompts
        : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
    const selectedPrompt = prompts[selectedPromptIndex];

    return evalData.results.results.reduce(
      (acc, row) => {
        // Filter by selected target/provider if multiple targets exist
        if (prompts.length > 1 && selectedPrompt && row.promptIdx !== selectedPromptIndex) {
          return acc;
        }

        const pluginId = getPluginIdFromResult(row);
        if (!pluginId) {
          return acc;
        }

        // Exclude results with errors from statistics
        if (row.error && row.failureReason === ResultFailureReason.ERROR) {
          return acc;
        }

        acc[pluginId] = acc[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
        acc[pluginId].total++;

        // Check if moderation tests failed but other tests passed - this indicates content was
        // flagged by moderation but would have passed otherwise
        const moderationPassed = row.gradingResult?.componentResults?.some(
          (result) => result.assertion?.type === 'moderation' && !result.pass,
        );

        if (row.success) {
          acc[pluginId].pass++;
          acc[pluginId].passWithFilter++; // Both regular and filtered pass counts increment
        } else if (moderationPassed) {
          acc[pluginId].passWithFilter++; // Only filtered pass count increments (partial success under moderation)
        }

        // Increment for grader-originated failures
        if (row.failureReason === ResultFailureReason.ASSERT) {
          acc[pluginId].failCount++;
        }

        return acc;
      },
      {} as Record<string, Required<TestResultStats>>,
    );
  }, [evalData, selectedPromptIndex]);

  const strategyStats = React.useMemo(() => {
    if (!failuresByPlugin || !passesByPlugin) {
      return {};
    }

    const stats: CategoryStats = {};

    Object.values(failuresByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId = getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].total += 1;
        stats[strategyId].failCount += 1;
      });
    });

    Object.values(passesByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId = getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].total += 1;
        stats[strategyId].pass += 1;
      });
    });

    return stats;
  }, [failuresByPlugin, passesByPlugin]);

  const availableCategories = React.useMemo(() => {
    return Object.keys(categoryStats).sort();
  }, [categoryStats]);

  const availableStrategies = React.useMemo(() => {
    return Object.keys(strategyStats).sort();
  }, [strategyStats]);

  const filteredFailuresByPlugin = React.useMemo(() => {
    if (!failuresByPlugin) {
      return {} as typeof failuresByPlugin;
    }

    const filtered: typeof failuresByPlugin = {};

    Object.entries(failuresByPlugin).forEach(([pluginId, tests]) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(pluginId)) {
        return;
      }

      if (statusFilter === 'pass') {
        return;
      }

      const filteredTests = tests.filter((test) => {
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          const promptMatches = test.prompt?.toLowerCase().includes(searchLower);
          const outputMatches = test.output?.toLowerCase().includes(searchLower);
          if (!promptMatches && !outputMatches) {
            return false;
          }
        }

        if (selectedStrategies.length > 0) {
          const strategyId =
            test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
          if (!selectedStrategies.includes(strategyId)) {
            return false;
          }
        }

        return true;
      });

      if (filteredTests.length > 0) {
        filtered[pluginId] = filteredTests;
      }
    });

    return filtered;
  }, [failuresByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery]);

  const filteredPassesByPlugin = React.useMemo(() => {
    if (!passesByPlugin) {
      return {} as typeof passesByPlugin;
    }

    const filtered: typeof passesByPlugin = {};

    Object.entries(passesByPlugin).forEach(([pluginId, tests]) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(pluginId)) {
        return;
      }

      if (statusFilter === 'fail') {
        return;
      }

      const filteredTests = tests.filter((test) => {
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          const promptMatches = test.prompt?.toLowerCase().includes(searchLower);
          const outputMatches = test.output?.toLowerCase().includes(searchLower);
          if (!promptMatches && !outputMatches) {
            return false;
          }
        }

        if (selectedStrategies.length > 0) {
          const strategyId =
            test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
          if (!selectedStrategies.includes(strategyId)) {
            return false;
          }
        }

        return true;
      });

      if (filteredTests.length > 0) {
        filtered[pluginId] = filteredTests;
      }
    });

    return filtered;
  }, [passesByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery]);

  /**
   * Recalculates category (plugin) stats given the filtered failures and passes.
   */
  const filteredCategoryStats = React.useMemo(() => {
    const stats: Record<string, Required<TestResultStats>> = {};

    Object.entries(filteredFailuresByPlugin).forEach(([pluginId, tests]) => {
      // Initialize the stats for the plugin
      stats[pluginId] = stats[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
      stats[pluginId].total += tests.length;
      stats[pluginId].failCount += tests.length;
    });

    Object.entries(filteredPassesByPlugin).forEach(([pluginId, tests]) => {
      // Initialize the stats for the plugin if it doesn't already exist
      stats[pluginId] = stats[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
      stats[pluginId].pass += tests.length;
      stats[pluginId].passWithFilter += tests.length;
      stats[pluginId].total += tests.length;
    });

    return stats;
  }, [filteredFailuresByPlugin, filteredPassesByPlugin]);

  const filteredStrategyStats = React.useMemo(() => {
    const stats: CategoryStats = {};

    Object.values(filteredFailuresByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId =
          test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].failCount += 1;
        stats[strategyId].total += 1;
      });
    });

    Object.values(filteredPassesByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId =
          test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].total += 1;
        stats[strategyId].pass += 1;
      });
    });

    return stats;
  }, [filteredFailuresByPlugin, filteredPassesByPlugin]);

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedStrategies.length > 0 ||
    statusFilter !== 'all' ||
    Boolean(searchQuery);

  /**
   * Extracts custom policy IDs from the results in order to then
   * filter policies from the categories stats for the framework compliance section.
   */
  const customPolicyIds = React.useMemo(() => {
    const ids = new Set();
    if (!evalData) {
      return ids;
    }

    evalData.results.results.forEach((row) => {
      if (row.metadata?.pluginId === 'policy') {
        ids.add(getPluginIdFromResult(row));
      }
    });

    return ids;
  }, [evalData]);

  /**
   * Constructs category stats for the framework compliance section.
   *
   * - Determines whether to use filtered or unfiltered category stats based on the presence of active filters.
   * - Removes custom policies; they do not belong to any framework.
   */
  const categoryStatsForFrameworkCompliance = React.useMemo(() => {
    const stats = { ...(hasActiveFilters ? filteredCategoryStats : categoryStats) };
    // Remove custom policies; they do not belong to any framework.
    Object.keys(stats).forEach((pluginId) => {
      if (customPolicyIds.has(pluginId)) {
        delete stats[pluginId];
      }
    });
    return stats;
  }, [hasActiveFilters, filteredCategoryStats, categoryStats, customPolicyIds]);

  usePageMeta({
    title: `Report: ${evalData?.config.description || evalId || 'Red Team'}`,
    description: 'Red team evaluation report',
  });

  if (!evalData || !evalId) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          justifyContent: 'center',
          alignItems: 'center',
          height: '9rem',
        }}
      >
        <CircularProgress size={22} />
        <Box>Waiting for report data</Box>
      </Box>
    );
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
            The {searchParams.get('evalId') ? 'selected' : 'latest'} evaluation results are not
            displayable in report format.
          </Typography>
          <Typography variant="body1">Please run a red team and try again.</Typography>
        </Paper>
      </Box>
    );
  }

  const prompts =
    (evalData.version >= 4
      ? evalData.prompts
      : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
  const selectedPrompt = prompts[selectedPromptIndex];
  const tableData =
    (evalData.version >= 4
      ? convertResultsToTable(evalData).body
      : (evalData.results as EvaluateSummaryV2).table.body) || [];

  let tools = [];
  if (Array.isArray(evalData.config.providers) && isProviderOptions(evalData.config.providers[0])) {
    const providerTools = evalData.config.providers[0].config?.tools;
    // If providerTools exists, convert it to an array (if it's not already)
    // Otherwise, use an empty array
    tools = providerTools ? (Array.isArray(providerTools) ? providerTools : [providerTools]) : [];
  }

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedStrategies([]);
    setStatusFilter('all');
    setSearchQuery('');
  };

  const ActionButtons = () => (
    <>
      <Tooltip title="View all logs" placement="top">
        <IconButton
          sx={{ position: 'relative' }}
          aria-label="view all logs"
          onClick={(event) => {
            const url = `/eval/${evalId}`;
            if (event.ctrlKey || event.metaKey) {
              window.open(url, '_blank');
            } else if (evalId) {
              navigate(url);
            }
          }}
        >
          <ListAltIcon />
        </IconButton>
      </Tooltip>
      <ReportDownloadButton
        evalDescription={evalData.config.description || evalId}
        evalData={evalData}
      />
      <Tooltip
        title="Print this page (Ctrl+P) and select 'Save as PDF' for best results"
        placement="top"
      >
        <IconButton
          sx={{ position: 'relative' }}
          aria-label="print page"
          onClick={() => window.print()}
        >
          <PrintIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Filter results" placement="top">
        <IconButton
          sx={{ position: 'relative' }}
          aria-label="filter results"
          onClick={() => setIsFiltersVisible(!isFiltersVisible)}
          color={hasActiveFilters ? 'primary' : 'default'}
        >
          <FilterListIcon />
        </IconButton>
      </Tooltip>
      <ReportSettingsDialogButton />
    </>
  );

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          backgroundColor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transform: isScrolled ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform 0.15s ease-in-out',
          boxShadow: isScrolled ? 2 : 0,
        }}
        className="print-hide"
      >
        <Container maxWidth="xl">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 2,
              minHeight: 64,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 'bold',
                flexGrow: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                pr: 2,
              }}
            >
              {evalData.config.description || 'Risk Assessment'}
            </Typography>
            <Box sx={{ display: 'flex', flexShrink: 0 }}>
              <ActionButtons />
            </Box>
          </Box>
        </Container>
      </Box>
      <Container maxWidth="xl">
        <Stack spacing={4} pb={8} pt={2}>
          {evalData.config.redteam && <EnterpriseBanner evalId={evalId || ''} />}
          <Card className="report-header" sx={{ position: 'relative' }}>
            <Box
              sx={{ position: 'absolute', top: 8, right: 8, display: 'flex' }}
              className="print-hide"
            >
              <ActionButtons />
            </Box>
            <Typography variant="h4">
              <strong>{evalData.config.description || 'Risk Assessment'}</strong>
            </Typography>
            <Typography variant="subtitle1" mb={2}>
              {formatDataGridDate(evalData.createdAt)}
            </Typography>
            <Box className="report-details" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {selectedPrompt && prompts.length > 1 ? (
                <Select
                  value={selectedPromptIndex}
                  onChange={(e) => setSelectedPromptIndex(Number(e.target.value))}
                  displayEmpty
                  size="small"
                  variant="outlined"
                  sx={(theme) => ({
                    height: '24px',
                    fontSize: '0.8125rem',
                    lineHeight: 1.43,
                    borderRadius: '16px',
                    backgroundColor:
                      theme.palette.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(0, 0, 0, 0.08)',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      backgroundColor:
                        theme.palette.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.13)'
                          : 'rgba(0, 0, 0, 0.13)',
                    },
                    '&.Mui-focused': {
                      backgroundColor:
                        theme.palette.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.16)'
                          : 'rgba(0, 0, 0, 0.16)',
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                      border: 'none',
                    },
                    '& .MuiSelect-select': {
                      paddingTop: '3px',
                      paddingBottom: '3px',
                      paddingLeft: '12px',
                      paddingRight: '32px !important',
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 'auto',
                    },
                    '& .MuiSelect-icon': {
                      color: 'inherit',
                      opacity: 0.7,
                      right: '4px',
                      fontSize: '1.2rem',
                    },
                  })}
                  renderValue={(value) => (
                    <Box component="span" sx={{ fontSize: '0.8125rem' }}>
                      <strong>Target:</strong> {prompts[value].provider}
                    </Box>
                  )}
                >
                  {prompts.map((prompt, idx) => (
                    <MenuItem key={idx} value={idx}>
                      {prompt.provider}
                    </MenuItem>
                  ))}
                </Select>
              ) : selectedPrompt ? (
                <Chip
                  size="small"
                  label={
                    <>
                      <strong>Target:</strong> {selectedPrompt.provider}
                    </>
                  }
                />
              ) : null}
              <Tooltip
                title={
                  selectedPrompt?.metrics?.tokenUsage?.total
                    ? `${selectedPrompt.metrics.tokenUsage.total.toLocaleString()} tokens`
                    : ''
                }
              >
                <Chip
                  size="small"
                  label={
                    <>
                      <strong>Depth:</strong>{' '}
                      {(
                        selectedPrompt?.metrics?.tokenUsage?.numRequests || tableData.length
                      ).toLocaleString()}{' '}
                      probes
                    </>
                  }
                />
              </Tooltip>
              {selectedPrompt && selectedPrompt.raw !== '{{prompt}}' && (
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
                />
              )}
              {tools.length > 0 && (
                <Chip
                  size="small"
                  label={
                    <>
                      <strong>Tools:</strong> {tools.length} available
                    </>
                  }
                  onClick={() => setIsToolsDialogOpen(true)}
                  style={{ cursor: 'pointer' }}
                />
              )}
            </Box>
          </Card>
          {isFiltersVisible && (
            <Card className="print-hide">
              <Box sx={{ p: 3 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                  }}
                >
                  <Typography variant="h6">Filters</Typography>
                  {hasActiveFilters && (
                    <Button startIcon={<ClearIcon />} onClick={clearAllFilters} size="small">
                      Clear All
                    </Button>
                  )}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    label="Search prompts & outputs"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    variant="outlined"
                    size="small"
                    sx={{ minWidth: 200 }}
                  />

                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={statusFilter}
                      label="Status"
                      onChange={(event: SelectChangeEvent<'all' | 'pass' | 'fail'>) =>
                        setStatusFilter(event.target.value as 'all' | 'pass' | 'fail')
                      }
                    >
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="pass">Pass Only</MenuItem>
                      <MenuItem value="fail">Fail Only</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Risk Categories</InputLabel>
                    <Select
                      multiple
                      value={selectedCategories}
                      onChange={(event: SelectChangeEvent<string[]>) => {
                        const value = event.target.value;
                        setSelectedCategories(typeof value === 'string' ? [value] : value);
                      }}
                      input={<OutlinedInput label="Risk Categories" />}
                      renderValue={(selected: string[]) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value: string) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {availableCategories.map((category) => (
                        <MenuItem key={category} value={category}>
                          {category}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Strategies</InputLabel>
                    <Select
                      multiple
                      value={selectedStrategies}
                      onChange={(event: SelectChangeEvent<string[]>) => {
                        const value = event.target.value;
                        setSelectedStrategies(typeof value === 'string' ? [value] : value);
                      }}
                      input={<OutlinedInput label="Strategies" />}
                      renderValue={(selected: string[]) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value: string) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {availableStrategies.map((strategy) => (
                        <MenuItem key={strategy} value={strategy}>
                          {strategy}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Box>
            </Card>
          )}
          <Overview
            categoryStats={hasActiveFilters ? filteredCategoryStats : categoryStats}
            plugins={evalData.config.redteam.plugins || []}
            vulnerabilitiesDataGridRef={vulnerabilitiesDataGridRef}
            setVulnerabilitiesDataGridFilterModel={setVulnerabilitiesDataGridFilterModel}
          />
          <StrategyStats
            strategyStats={hasActiveFilters ? filteredStrategyStats : strategyStats}
            failuresByPlugin={hasActiveFilters ? filteredFailuresByPlugin : failuresByPlugin}
            passesByPlugin={hasActiveFilters ? filteredPassesByPlugin : passesByPlugin}
            plugins={evalData.config.redteam.plugins || []}
          />
          <RiskCategories
            categoryStats={hasActiveFilters ? filteredCategoryStats : categoryStats}
            evalId={evalId}
            failuresByPlugin={hasActiveFilters ? filteredFailuresByPlugin : failuresByPlugin}
            passesByPlugin={hasActiveFilters ? filteredPassesByPlugin : passesByPlugin}
          />
          <TestSuites
            evalId={evalId}
            categoryStats={hasActiveFilters ? filteredCategoryStats : categoryStats}
            plugins={evalData.config.redteam.plugins || []}
            failuresByPlugin={hasActiveFilters ? filteredFailuresByPlugin : failuresByPlugin}
            passesByPlugin={hasActiveFilters ? filteredPassesByPlugin : passesByPlugin}
            vulnerabilitiesDataGridRef={vulnerabilitiesDataGridRef}
            vulnerabilitiesDataGridFilterModel={vulnerabilitiesDataGridFilterModel}
            setVulnerabilitiesDataGridFilterModel={setVulnerabilitiesDataGridFilterModel}
          />
          <FrameworkCompliance
            evalId={evalId}
            categoryStats={categoryStatsForFrameworkCompliance}
            config={evalData.config}
          />
        </Stack>
        <ToolsDialog
          open={isToolsDialogOpen}
          onClose={() => setIsToolsDialogOpen(false)}
          tools={tools}
        />
      </Container>
    </>
  );
};

export default App;
