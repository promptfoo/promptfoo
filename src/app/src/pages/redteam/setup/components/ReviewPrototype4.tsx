import React, { useCallback, useEffect, useMemo, useState } from 'react';

import Code from '@app/components/Code';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import DescriptionIcon from '@mui/icons-material/Description';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import FlagIcon from '@mui/icons-material/Flag';
import InfoIcon from '@mui/icons-material/Info';
import InsightsIcon from '@mui/icons-material/Insights';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PolicyIcon from '@mui/icons-material/Policy';
import PsychologyIcon from '@mui/icons-material/Psychology';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import StopIcon from '@mui/icons-material/Stop';
import SummarizeIcon from '@mui/icons-material/Summarize';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { REDTEAM_DEFAULTS, pluginDisplayNames, strategyDisplayNames } from '@promptfoo/redteam/constants';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { generateOrderedYaml } from '../utils/yamlHelpers';
import DefaultTestVariables from './DefaultTestVariables';
import { EmailVerificationDialog } from './EmailVerificationDialog';
import { LogViewer } from './LogViewer';
import type { RedteamPlugin } from '@promptfoo/redteam/types';
import type { Job } from '@promptfoo/types';

interface PolicyPlugin {
  id: 'policy';
  config: {
    policy: string;
  };
}

interface JobStatusResponse {
  hasRunningJob: boolean;
  jobId?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`review-tabpanel-${index}`}
      aria-labelledby={`review-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

/**
 * Prototype 4: Tabbed Interface with Detailed Sections
 * - Organized tabs for different aspects of configuration
 * - Detailed tables and lists for comprehensive review
 * - Summary dashboard tab with key metrics
 * - Separate tabs for context, plugins, strategies, and execution
 */
export default function ReviewPrototype4() {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const [isYamlDialogOpen, setIsYamlDialogOpen] = React.useState(false);
  const yamlContent = useMemo(() => generateOrderedYaml(config), [config]);

  const [isRunning, setIsRunning] = React.useState(false);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const { showToast } = useToast();
  const [debugMode, setDebugMode] = React.useState(false);
  const [maxConcurrency, setMaxConcurrency] = React.useState(
    String(config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY),
  );
  const [delayMs, setDelayMs] = React.useState('0');
  const [isJobStatusDialogOpen, setIsJobStatusDialogOpen] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [isRunSettingsDialogOpen, setIsRunSettingsDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState('');
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);
  const { checkEmailStatus } = useEmailVerification();

  const [tabValue, setTabValue] = useState(0);

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('description', event.target.value);
  };

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_review_prototype4' });
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Calculate stats
  const stats = useMemo(() => {
    const pluginCount = config.plugins.length;
    const strategyCount = config.strategies.length;
    const testsPerPlugin = config.numTests || REDTEAM_DEFAULTS.NUM_TESTS;
    const totalTests = pluginCount * strategyCount * testsPerPlugin;
    const concurrency = Number(maxConcurrency) || REDTEAM_DEFAULTS.MAX_CONCURRENCY;
    const delay = Number(delayMs) || 0;
    const timePerTest = delay > 0 ? delay : 500;
    const totalTime = (totalTests * timePerTest) / concurrency;
    const estimatedMinutes = Math.ceil(totalTime / 60000);

    return {
      pluginCount,
      strategyCount,
      testsPerPlugin,
      totalTests,
      estimatedMinutes,
      concurrency,
      delay,
    };
  }, [config.plugins.length, config.strategies.length, config.numTests, maxConcurrency, delayMs]);

  const getPluginSummary = useCallback((plugin: string | RedteamPlugin) => {
    if (typeof plugin === 'string') {
      return { 
        label: pluginDisplayNames[plugin as keyof typeof pluginDisplayNames] || plugin, 
        id: plugin,
        count: 1 
      };
    }
    if (plugin.id === 'policy') {
      return { label: 'Custom Policy', id: 'policy', count: 1 };
    }
    if (plugin.id === 'intent') {
      return { label: 'Custom Intent', id: 'intent', count: 1 };
    }
    return { 
      label: pluginDisplayNames[plugin.id as keyof typeof pluginDisplayNames] || plugin.id, 
      id: plugin.id,
      count: 1 
    };
  }, []);

  const pluginSummary = useMemo(() => {
    const summary = new Map<string, { count: number; id: string }>();
    config.plugins.forEach((plugin) => {
      const { label, id, count } = getPluginSummary(plugin);
      if (summary.has(label)) {
        const existing = summary.get(label)!;
        existing.count += count;
      } else {
        summary.set(label, { count, id });
      }
    });
    return Array.from(summary.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [config.plugins, getPluginSummary]);

  const customPolicies = useMemo(() => {
    return config.plugins.filter(
      (p): p is PolicyPlugin => typeof p === 'object' && p.id === 'policy',
    );
  }, [config.plugins]);

  const intents = useMemo(() => {
    return config.plugins
      .filter(
        (p): p is { id: 'intent'; config: { intent: string | string[] } } =>
          typeof p === 'object' && p.id === 'intent' && p.config?.intent !== undefined,
      )
      .map((p) => p.config.intent)
      .flat()
      .filter((intent): intent is string => typeof intent === 'string' && intent.trim() !== '');
  }, [config.plugins]);

  const getStrategyId = (strategy: string | { id: string }): string => {
    return typeof strategy === 'string' ? strategy : strategy.id;
  };

  const strategySummary = useMemo(() => {
    const summary = new Map<string, number>();
    config.strategies.forEach((strategy) => {
      const id = getStrategyId(strategy);
      const label = strategyDisplayNames[id as keyof typeof strategyDisplayNames] || id;
      summary.set(label, (summary.get(label) || 0) + 1);
    });
    return Array.from(summary.entries()).sort((a, b) => b[1] - a[1]);
  }, [config.strategies]);

  const categorizedPlugins = useMemo(() => {
    const categories: Record<string, typeof pluginSummary> = {
      'Harmful Content': [],
      'PII & Privacy': [],
      'Bias Detection': [],
      'Security': [],
      'Medical': [],
      'Financial': [],
      'Custom': [],
      'Other': [],
    };

    pluginSummary.forEach((plugin) => {
      if (plugin.id.startsWith('harmful:')) {
        categories['Harmful Content'].push(plugin);
      } else if (plugin.id.startsWith('pii:')) {
        categories['PII & Privacy'].push(plugin);
      } else if (plugin.id.startsWith('bias:')) {
        categories['Bias Detection'].push(plugin);
      } else if (plugin.id.startsWith('medical:')) {
        categories['Medical'].push(plugin);
      } else if (plugin.id.startsWith('financial:')) {
        categories['Financial'].push(plugin);
      } else if (plugin.id === 'policy' || plugin.id === 'intent') {
        categories['Custom'].push(plugin);
      } else if (['contracts', 'excessive-agency', 'hallucination', 'hijacking', 'politics'].includes(plugin.id)) {
        categories['Security'].push(plugin);
      } else {
        categories['Other'].push(plugin);
      }
    });

    return Object.entries(categories).filter(([_, plugins]) => plugins.length > 0);
  }, [pluginSummary]);

  const handleSaveYaml = () => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'promptfooconfig.yaml';
    link.click();
    URL.revokeObjectURL(url);
  };

  const checkForRunningJob = async (): Promise<JobStatusResponse> => {
    try {
      const response = await callApi('/redteam/status');
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error checking job status:', error);
      return { hasRunningJob: false };
    }
  };

  const handleRunWithSettings = async () => {
    setIsRunSettingsDialogOpen(false);

    const emailResult = await checkEmailStatus();
    if (!emailResult.canProceed) {
      if (emailResult.needsEmail) {
        setEmailVerificationMessage(
          emailResult.status?.message ||
            'Redteam evals require email verification. Please enter your work email:',
        );
        setIsEmailDialogOpen(true);
        return;
      } else if (emailResult.error) {
        setEmailVerificationError(emailResult.error);
        showToast(emailResult.error, 'error');
        return;
      }
    }

    const { hasRunningJob } = await checkForRunningJob();
    if (hasRunningJob) {
      setIsJobStatusDialogOpen(true);
      return;
    }

    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }

    setIsRunning(true);
    setLogs([]);
    setEvalId(null);

    try {
      const response = await callApi('/redteam/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: getUnifiedConfig(config),
          force: true,
          verbose: debugMode,
          maxConcurrency,
          delayMs,
        }),
      });

      const { id } = await response.json();

      const interval = setInterval(async () => {
        const statusResponse = await callApi(`/eval/job/${id}`);
        const status = (await statusResponse.json()) as Job;

        if (status.logs) {
          setLogs(status.logs);
        }

        if (status.status === 'complete' || status.status === 'error') {
          clearInterval(interval);
          setPollInterval(null);
          setIsRunning(false);

          if (status.status === 'complete' && status.result && status.evalId) {
            setEvalId(status.evalId);
          } else if (status.status === 'complete') {
            showToast(
              'The evaluation completed but no results were generated. Please check the logs for details.',
              'warning',
            );
          } else {
            showToast(
              'An error occurred during evaluation. Please check the logs for details.',
              'error',
            );
          }
        }
      }, 1000);

      setPollInterval(interval);
    } catch (error) {
      console.error('Error running redteam:', error);
      setIsRunning(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast(
        `An error occurred while starting the evaluation: ${errorMessage}. Please try again.`,
        'error',
      );
    }
  };

  const handleCancel = async () => {
    try {
      await callApi('/redteam/cancel', {
        method: 'POST',
      });

      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }

      setIsRunning(false);
      showToast('Cancel request submitted', 'success');
    } catch (error) {
      console.error('Error cancelling job:', error);
      showToast('Failed to cancel job', 'error');
    }
  };

  const handleCancelExistingAndRun = async () => {
    try {
      await handleCancel();
      setIsJobStatusDialogOpen(false);
      setTimeout(() => {
        handleRunWithSettings();
      }, 500);
    } catch (error) {
      console.error('Error canceling existing job:', error);
      showToast('Failed to cancel existing job', 'error');
    }
  };

  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  return (
    <Box maxWidth="xl" mx="auto">
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
        Red Team Configuration Review
      </Typography>

      <TextField
        fullWidth
        label="Configuration Name"
        placeholder="My Red Team Configuration"
        value={config.description}
        onChange={handleDescriptionChange}
        variant="outlined"
        sx={{ mb: 4 }}
        InputProps={{
          startAdornment: <DescriptionIcon sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
      />

      <Paper sx={{ width: '100%', mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab 
            label="Summary" 
            icon={<SummarizeIcon />} 
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
          <Tab 
            label={
              <Badge badgeContent={config.applicationDefinition ? 1 : 0} color="primary">
                <span>Application Context</span>
              </Badge>
            }
            icon={<FingerprintIcon />} 
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
          <Tab 
            label={
              <Badge badgeContent={stats.pluginCount} color="primary">
                <span>Security Plugins</span>
              </Badge>
            }
            icon={<ExtensionIcon />} 
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
          <Tab 
            label={
              <Badge badgeContent={stats.strategyCount} color="primary">
                <span>Attack Strategies</span>
              </Badge>
            }
            icon={<PsychologyIcon />} 
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
          <Tab 
            label="Execution Plan" 
            icon={<RocketLaunchIcon />} 
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
        </Tabs>
      </Paper>

      {/* Summary Tab */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          {/* Quick Stats */}
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <ExtensionIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                    <Typography variant="h4" fontWeight="bold">{stats.pluginCount}</Typography>
                    <Typography variant="body2" color="text.secondary">Security Plugins</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <AccountTreeIcon sx={{ fontSize: 40, color: 'secondary.main', mb: 1 }} />
                    <Typography variant="h4" fontWeight="bold">{stats.strategyCount}</Typography>
                    <Typography variant="body2" color="text.secondary">Attack Strategies</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <ListAltIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                    <Typography variant="h4" fontWeight="bold">{stats.totalTests}</Typography>
                    <Typography variant="body2" color="text.secondary">Total Test Cases</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <DirectionsRunIcon sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
                    <Typography variant="h4" fontWeight="bold">~{stats.estimatedMinutes}m</Typography>
                    <Typography variant="body2" color="text.secondary">Est. Runtime</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>

          {/* Key Configuration Points */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InfoIcon /> Key Configuration Points
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Application Purpose"
                    secondary={config.purpose || config.applicationDefinition?.purpose || 'Not specified'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon><FlagIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Red Team Persona"
                    secondary={config.applicationDefinition?.redteamUser || 'Default attacker'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon><IntegrationInstructionsIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Test Generation Instructions"
                    secondary={config.testGenerationInstructions ? 'Custom instructions provided' : 'Using defaults'}
                  />
                </ListItem>
              </List>
            </Paper>
          </Grid>

          {/* Top Plugins & Strategies */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InsightsIcon /> Top Testing Components
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Most Used Plugins
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {pluginSummary.slice(0, 5).map(({ label, count }) => (
                    <Chip 
                      key={label} 
                      label={`${label} (${count})`} 
                      size="small" 
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Active Strategies
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {strategySummary.slice(0, 5).map(([label, count]) => (
                    <Chip 
                      key={label} 
                      label={`${label} (${count})`} 
                      size="small" 
                      color="secondary"
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Application Context Tab */}
      <TabPanel value={tabValue} index={1}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Application Overview</Typography>
              <Typography variant="body1" paragraph sx={{ whiteSpace: 'pre-wrap' }}>
                {config.purpose || config.applicationDefinition?.purpose || 'No application purpose specified'}
              </Typography>
              
              {config.applicationDefinition && (
                <TableContainer sx={{ mt: 3 }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Property</TableCell>
                        <TableCell>Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>Industry</TableCell>
                        <TableCell>{config.applicationDefinition.industry || 'Not specified'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>User Types</TableCell>
                        <TableCell>{config.applicationDefinition.userTypes || 'Not specified'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Red Team User Persona</TableCell>
                        <TableCell>{config.applicationDefinition.redteamUser || 'Default attacker'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Attack Constraints</TableCell>
                        <TableCell>{config.applicationDefinition.attackConstraints || 'None specified'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderColor: 'success.main', borderWidth: 2, borderStyle: 'solid' }}>
              <Typography variant="h6" gutterBottom color="success.main">
                Allowed Access
              </Typography>
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Data Access"
                    secondary={config.applicationDefinition?.accessToData || 'Not specified'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Action Access"
                    secondary={config.applicationDefinition?.accessToActions || 'Not specified'}
                  />
                </ListItem>
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderColor: 'error.main', borderWidth: 2, borderStyle: 'solid' }}>
              <Typography variant="h6" gutterBottom color="error.main">
                Forbidden Access
              </Typography>
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Forbidden Data"
                    secondary={config.applicationDefinition?.forbiddenData || 'Not specified'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Forbidden Actions"
                    secondary={config.applicationDefinition?.forbiddenActions || 'Not specified'}
                  />
                </ListItem>
              </List>
            </Paper>
          </Grid>

          {config.testGenerationInstructions && (
            <Grid item xs={12}>
              <Alert severity="info" icon={<CodeIcon />}>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  Test Generation Instructions
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {config.testGenerationInstructions}
                </Typography>
              </Alert>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Security Plugins Tab */}
      <TabPanel value={tabValue} index={2}>
        <Grid container spacing={3}>
          {categorizedPlugins.map(([category, plugins]) => (
            <Grid item xs={12} key={category}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  {category} ({plugins.length})
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Plugin Name</TableCell>
                        <TableCell>Plugin ID</TableCell>
                        <TableCell align="center">Count</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {plugins.map((plugin) => (
                        <TableRow key={plugin.label}>
                          <TableCell>{plugin.label}</TableCell>
                          <TableCell>
                            <code>{plugin.id}</code>
                          </TableCell>
                          <TableCell align="center">{plugin.count}</TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => {
                                const newPlugins = config.plugins.filter((p) => {
                                  const summary = getPluginSummary(p);
                                  return summary.label !== plugin.label;
                                });
                                updateConfig('plugins', newPlugins);
                              }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
          ))}

          {/* Custom Policies */}
          {customPolicies.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Custom Policies ({customPolicies.length})
                </Typography>
                <Stack spacing={2}>
                  {customPolicies.map((policy, idx) => (
                    <Alert key={idx} severity="info" icon={<PolicyIcon />}>
                      <Typography variant="body2">{policy.config.policy}</Typography>
                    </Alert>
                  ))}
                </Stack>
              </Paper>
            </Grid>
          )}

          {/* Custom Intents */}
          {intents.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Custom Attack Intents ({intents.length})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {intents.map((intent, idx) => (
                    <Chip key={idx} label={intent} variant="outlined" color="secondary" />
                  ))}
                </Box>
              </Paper>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Attack Strategies Tab */}
      <TabPanel value={tabValue} index={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Attack Strategy Configuration
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Strategy Name</TableCell>
                  <TableCell align="center">Count</TableCell>
                  <TableCell>Configuration</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {strategySummary.map(([label, count]) => {
                  const strategyId = Object.entries(strategyDisplayNames).find(
                    ([id, displayName]) => displayName === label,
                  )?.[0] || label;
                  
                  const strategyConfig = config.strategies.find(s => {
                    const id = getStrategyId(s);
                    return id === strategyId;
                  });
                  
                  const hasConfig = typeof strategyConfig === 'object' && strategyConfig.config;
                  
                  return (
                    <TableRow key={label}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography>{label}</Typography>
                          {hasConfig && (
                            <Chip label="Configured" size="small" color="primary" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">{count}</TableCell>
                      <TableCell>
                        {hasConfig && (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {JSON.stringify(strategyConfig.config, null, 2).substring(0, 100)}...
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => {
                            const newStrategies = config.strategies.filter((strategy) => {
                              const id = getStrategyId(strategy);
                              return id !== strategyId;
                            });
                            updateConfig('strategies', newStrategies);
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </TabPanel>

      {/* Execution Plan Tab */}
      <TabPanel value={tabValue} index={4}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AnalyticsIcon /> Execution Metrics
              </Typography>
              
              <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" color="primary">{stats.totalTests}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Test Cases
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {stats.pluginCount} × {stats.strategyCount} × {stats.testsPerPlugin}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" color="secondary">{stats.concurrency}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Concurrent Threads
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" color="warning.main">{stats.delay}ms</Typography>
                    <Typography variant="body2" color="text.secondary">
                      API Delay
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" color="info.main">~{stats.estimatedMinutes}m</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Est. Runtime
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Export Configuration
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Save your configuration for command-line execution or sharing
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  onClick={handleSaveYaml}
                  startIcon={<SaveIcon />}
                >
                  Download YAML
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setIsYamlDialogOpen(true)}
                  startIcon={<VisibilityIcon />}
                >
                  Preview YAML
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Run Evaluation
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Execute the red team evaluation directly in your browser
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleRunWithSettings}
                  disabled={isRunning}
                  startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                >
                  {isRunning ? 'Running...' : 'Run Now'}
                </Button>
                {isRunning && (
                  <Button
                    variant="contained"
                    color="error"
                    onClick={handleCancel}
                    startIcon={<StopIcon />}
                  >
                    Cancel
                  </Button>
                )}
                {evalId && (
                  <>
                    <Button
                      variant="outlined"
                      href={`/report?evalId=${evalId}`}
                      startIcon={<AssessmentIcon />}
                    >
                      Report
                    </Button>
                    <Button
                      variant="outlined"
                      href={`/eval?evalId=${evalId}`}
                      startIcon={<SearchIcon />}
                    >
                      Details
                    </Button>
                  </>
                )}
                <IconButton onClick={() => setIsRunSettingsDialogOpen(true)} disabled={isRunning}>
                  <SettingsIcon />
                </IconButton>
              </Stack>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                  />
                }
                label="Debug mode"
                sx={{ mt: 2 }}
              />
            </Paper>
          </Grid>

          {logs.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Execution Logs
                </Typography>
                <LogViewer logs={logs} />
              </Paper>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      <Divider sx={{ my: 4 }} />

      {/* Advanced Configuration */}
      <Accordion sx={{ mb: 4, '&:before': { display: 'none' }, boxShadow: theme.shadows[1] }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TuneIcon fontSize="small" color="action" />
            <Typography variant="h6">Advanced Configuration</Typography>
            <Chip label="Optional" size="small" variant="outlined" sx={{ ml: 1 }} />
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <DefaultTestVariables />
        </AccordionDetails>
      </Accordion>

      {/* Dialogs */}
      <Dialog open={isYamlDialogOpen} onClose={() => setIsYamlDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>YAML Configuration Preview</DialogTitle>
        <DialogContent>
          <YamlEditor initialYaml={yamlContent} readOnly />
        </DialogContent>
      </Dialog>

      <Dialog open={isJobStatusDialogOpen} onClose={() => setIsJobStatusDialogOpen(false)}>
        <DialogTitle>Job Already Running</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            There is already a red team evaluation running. Would you like to cancel it and start a new one?
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
            <Button variant="outlined" onClick={() => setIsJobStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="contained" color="primary" onClick={handleCancelExistingAndRun}>
              Cancel Existing & Run New
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={isRunSettingsDialogOpen} onClose={() => setIsRunSettingsDialogOpen(false)}>
        <DialogTitle>Run Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1, minWidth: 400 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                  disabled={isRunning}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">Debug mode</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Show detailed logs during execution
                  </Typography>
                </Box>
              }
            />
            <TextField
              fullWidth
              type="number"
              label="Number of test cases"
              value={config.numTests}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (!Number.isNaN(value) && value > 0 && Number.isInteger(value)) {
                  updateConfig('numTests', value);
                }
              }}
              disabled={isRunning}
              helperText="Tests to generate per plugin"
            />
            <TextField
              fullWidth
              type="number"
              label="Max concurrency"
              value={maxConcurrency}
              onChange={(e) => {
                const value = e.target.value;
                if (!Number.isNaN(Number(value)) && Number(value) >= 0) {
                  setMaxConcurrency(value);
                  updateConfig('maxConcurrency', Number(value));
                }
              }}
              disabled={isRunning}
              helperText="Maximum parallel evaluations"
            />
            <TextField
              fullWidth
              type="number"
              label="API call delay (ms)"
              value={delayMs}
              onChange={(e) => {
                const value = e.target.value;
                if (!Number.isNaN(Number(value)) && Number(value) >= 0) {
                  setDelayMs(value);
                }
              }}
              disabled={isRunning}
              helperText="Delay between API calls"
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button onClick={() => setIsRunSettingsDialogOpen(false)}>Done</Button>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>

      <EmailVerificationDialog
        open={isEmailDialogOpen}
        onClose={() => setIsEmailDialogOpen(false)}
        onSuccess={() => {
          setIsEmailDialogOpen(false);
          handleRunWithSettings();
        }}
        message={emailVerificationMessage}
      />
    </Box>
  );
}