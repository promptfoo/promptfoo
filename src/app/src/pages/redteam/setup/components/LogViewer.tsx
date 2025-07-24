import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useToast } from '@app/hooks/useToast';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';
import ShareIcon from '@mui/icons-material/Share';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Convert from 'ansi-to-html';

interface LogViewerProps {
  logs: string[];
}

interface LogSection {
  type:
    | 'phase'
    | 'table'
    | 'summary'
    | 'separator'
    | 'regular'
    | 'plugin-list'
    | 'status-update'
    | 'test-generation'
    | 'test-execution';
  content: string[];
  title?: string;
  progress?: { current: number; total: number };
  metadata?: Record<string, any>;
  relatedContent?: string[]; // For storing related table content
}

export function LogViewer({ logs }: LogViewerProps) {
  const theme = useTheme();
  const toast = useToast();
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);
  const [showScrollButton, setShowScrollButton] = React.useState(false);
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set());
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenLogsContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollPositionRef = useRef<{ main: number; fullscreen: number }>({
    main: 0,
    fullscreen: 0,
  });

  const ansiConverter = useMemo(
    () =>
      new Convert({
        fg: theme.palette.mode === 'dark' ? '#fff' : '#000',
        bg: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [theme.palette.mode],
  );

  const convertAnsiToHtml = useCallback(
    (text: string) => {
      try {
        return ansiConverter.toHtml(text);
      } catch (e) {
        console.error('Failed to convert ANSI to HTML:', e);
        return text;
      }
    },
    [ansiConverter],
  );

  const parseLogSections = useMemo((): LogSection[] => {
    const sections: LogSection[] = [];

    // Split logs by separator lines (long equal signs)
    const separatorRegex = /^=+$/;
    const logChunks: string[][] = [];
    let currentChunk: string[] = [];

    for (const line of logs) {
      if (separatorRegex.test(line.trim())) {
        if (currentChunk.length > 0) {
          logChunks.push([...currentChunk]);
          currentChunk = [];
        }
      } else {
        currentChunk.push(line);
      }
    }

    // Add the last chunk if it exists
    if (currentChunk.length > 0) {
      logChunks.push(currentChunk);
    }

    // Process each chunk to determine its type and content
    const summaryChunks: string[][] = [];

    for (let chunkIndex = 0; chunkIndex < logChunks.length; chunkIndex++) {
      const chunk = logChunks[chunkIndex];
      if (chunk.length === 0) {
        continue;
      }

      const firstLine = chunk[0]?.trim() || '';
      const chunkContent = chunk.join('\n');

      // Determine section type based on content
      let sectionType: LogSection['type'] = 'regular';
      let title = '';
      let progress: { current: number; total: number } | undefined;

      // Test Generation section
      if (
        firstLine.includes('Generating test cases...') ||
        chunkContent.includes('Synthesizing test cases') ||
        chunkContent.includes('Using plugins:') ||
        chunkContent.includes('Test Generation Summary:')
      ) {
        sectionType = 'test-generation';
        title = 'Test Generation';

        // Check if this chunk also contains the test generation table
        if (chunkContent.includes('│') && chunkContent.includes('Plugin')) {
          // This chunk contains both generation logs and the table
          const lines = chunk;
          const tableStart = lines.findIndex((line) => line.includes('┌') || line.includes('│'));
          if (tableStart !== -1) {
            sections.push({
              type: 'test-generation',
              content: lines.slice(0, tableStart),
              title,
              relatedContent: lines.slice(tableStart),
            });
            continue;
          }
        }
      }

      // Test execution section
      else if (
        firstLine.includes('Running scan...') ||
        firstLine.includes('Starting evaluation') ||
        chunkContent.match(/\[\d+\/\d+\]\s+Running/)
      ) {
        sectionType = 'test-execution';
        title = 'Test Execution';

        // Extract progress from the chunk
        const progressMatch = chunkContent.match(/\[(\d+)\/(\d+)\]\s+Running/g);
        if (progressMatch) {
          const lastProgress = progressMatch[progressMatch.length - 1];
          const match = lastProgress.match(/\[(\d+)\/(\d+)\]/);
          if (match) {
            progress = {
              current: parseInt(match[1]),
              total: parseInt(match[2]),
            };
          }
        }
      }

      // Summary section (completion, token usage, results) - collect all chunks
      else if (
        chunkContent.includes('Evaluation complete') ||
        chunkContent.includes('Token Usage Summary') ||
        chunkContent.includes('Red team scan complete!') ||
        chunkContent.includes('Duration:') ||
        chunkContent.includes('Successes:') ||
        chunkContent.includes('Pass Rate:')
      ) {
        summaryChunks.push(chunk);
        continue; // Don't add to sections yet, we'll consolidate all summary chunks
      }

      // Plugin list section
      else if (chunkContent.match(/\[33m\w+.*\(\d+\s+tests\)\[39m/)) {
        sectionType = 'plugin-list';
        title = 'Active Plugins';
      }

      // Status update
      else if (firstLine.startsWith('Emitting update for eval:')) {
        sectionType = 'status-update';
        title = firstLine.replace('Emitting update for eval:', '').trim();
      }

      sections.push({
        type: sectionType,
        content: chunk,
        title,
        progress,
      });
    }

    // Add consolidated summary section if we found any summary chunks
    if (summaryChunks.length > 0) {
      const consolidatedContent = summaryChunks.flat();
      sections.push({
        type: 'summary',
        content: consolidatedContent,
        title: 'Results Summary',
      });
    }

    return sections;
  }, [logs]);

  // Determine which sections should be auto-expanded
  const getAutoExpandedSections = useMemo(() => {
    const autoExpanded = new Set<string>();
    const latestSections = parseLogSections.slice(-3); // Show last 3 sections

    // Always expand the most recent active sections
    latestSections.forEach((section, index) => {
      const sectionId = `section-${parseLogSections.length - 3 + index}`;
      if (
        section.type === 'phase' ||
        section.type === 'summary' ||
        section.type === 'test-generation' ||
        section.type === 'test-execution'
      ) {
        autoExpanded.add(sectionId);
      }
    });

    return autoExpanded;
  }, [parseLogSections]);

  // Update expanded sections when auto-expanded changes
  useEffect(() => {
    const newExpanded = new Set([...expandedSections, ...getAutoExpandedSections]);
    setExpandedSections(newExpanded);
  }, [getAutoExpandedSections]);

  const handleAccordionChange = useCallback(
    (sectionId: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      const newExpanded = new Set(expandedSections);
      if (isExpanded) {
        newExpanded.add(sectionId);
      } else {
        newExpanded.delete(sectionId);
      }
      setExpandedSections(newExpanded);
    },
    [expandedSections],
  );

  // Parse summary data from logs
  const parseSummaryData = useCallback((content: string[]) => {
    const data = {
      completionMessage: '',
      evaluationId: '',
      tokenUsage: {
        probes: 0,
        evaluation: { total: 0, prompt: 0, completion: 0 },
        grading: { total: 0, prompt: 0, completion: 0 },
        grandTotal: 0,
      },
      providerBreakdown: [] as Array<{
        provider: string;
        tokens: number;
        prompt: number;
        completion: number;
      }>,
      duration: '',
      results: {
        successes: 0,
        failures: 0,
        errors: 0,
        passRate: 0,
      },
      instructions: [] as string[],
    };

    let currentSection = '';

    for (const line of content) {
      const trimmed = line.trim();

      // Completion message
      if (trimmed.includes('Red team scan complete!')) {
        data.completionMessage = 'Red team scan complete!';
      }

      // Evaluation ID - more flexible patterns
      const evalIdMatch =
        trimmed.match(/\[32m✔\[39m\s+Evaluation complete\.\s+ID:\s+\[36m([^[]+)\[39m/) ||
        trimmed.match(/Evaluation complete\.\s+ID:\s+([^\s]+)/) ||
        trimmed.match(/ID:\s+\[36m([^[]+)\[39m/);
      if (evalIdMatch) {
        data.evaluationId = evalIdMatch[1].trim();
      }

      // Track current section for context-aware parsing
      if (trimmed.match(/\[1mToken Usage Summary:\[22m/)) {
        currentSection = 'token-usage';
      } else if (trimmed.match(/\[33m\[1mEvaluation:\[22m\[39m/)) {
        currentSection = 'evaluation';
      } else if (trimmed.match(/\[35m\[1mGrading:\[22m\[39m/)) {
        currentSection = 'grading';
      }

      // Probes - more flexible patterns
      const probesMatch =
        trimmed.match(/\[36mProbes:\[39m\s+\[37m\[1m(\d+)\[22m\[39m/) ||
        trimmed.match(/Probes:\s+(\d+)/);
      if (probesMatch) {
        data.tokenUsage.probes = parseInt(probesMatch[1]);
      }

      // Context-aware parsing for Total, Prompt, Completion
      const totalMatch = trimmed.match(/\[90mTotal:\[39m\s+\[37m([\d,]+)\[39m/);
      const promptMatch = trimmed.match(/\[90mPrompt:\[39m\s+\[37m([\d,]+)\[39m/);
      const completionMatch = trimmed.match(/\[90mCompletion:\[39m\s+\[37m([\d,]+)\[39m/);

      if (currentSection === 'evaluation') {
        if (totalMatch) {
          data.tokenUsage.evaluation.total = parseInt(totalMatch[1].replace(/,/g, ''));
        }
        if (promptMatch) {
          data.tokenUsage.evaluation.prompt = parseInt(promptMatch[1].replace(/,/g, ''));
        }
        if (completionMatch) {
          data.tokenUsage.evaluation.completion = parseInt(completionMatch[1].replace(/,/g, ''));
        }
      } else if (currentSection === 'grading') {
        if (totalMatch) {
          data.tokenUsage.grading.total = parseInt(totalMatch[1].replace(/,/g, ''));
        }
        if (promptMatch) {
          data.tokenUsage.grading.prompt = parseInt(promptMatch[1].replace(/,/g, ''));
        }
        if (completionMatch) {
          data.tokenUsage.grading.completion = parseInt(completionMatch[1].replace(/,/g, ''));
        }
      }

      // Grand total - more flexible patterns
      const grandTotalMatch =
        trimmed.match(/\[34m\[1mGrand Total:\[22m\[39m\s+\[37m\[1m([\d,]+)\[22m\[39m\s+tokens/) ||
        trimmed.match(/Grand Total:\s+([\d,]+)\s+tokens/) ||
        trimmed.match(/\[34m\[1mGrand Total:\[22m\[39m\s+\[37m\[1m([\d,]+)\[22m\[39m/);
      if (grandTotalMatch) {
        data.tokenUsage.grandTotal = parseInt(grandTotalMatch[1].replace(/,/g, ''));
      }

      // Duration - handle both formats
      const durationMatch =
        trimmed.match(/\[90mDuration:\s*([^[]+)\[39m/) || trimmed.match(/Duration:\s*([^[]+)/);
      if (durationMatch) {
        data.duration = durationMatch[1].trim();
      }

      // Results - more flexible patterns
      const successMatch =
        trimmed.match(/\[32m\[1mSuccesses:\s*(\d+)\[22m\[39m/) ||
        trimmed.match(/Successes:\s*(\d+)/);
      if (successMatch) {
        data.results.successes = parseInt(successMatch[1]);
      }

      const failuresMatch =
        trimmed.match(/\[31m\[1mFailures:\s*(\d+)\[22m\[39m/) || trimmed.match(/Failures:\s*(\d+)/);
      if (failuresMatch) {
        data.results.failures = parseInt(failuresMatch[1]);
      }

      const errorsMatch =
        trimmed.match(/\[31m\[1mErrors:\s*(\d+)\[22m\[39m/) || trimmed.match(/Errors:\s*(\d+)/);
      if (errorsMatch) {
        data.results.errors = parseInt(errorsMatch[1]);
      }

      const passRateMatch =
        trimmed.match(/\[34m\[1mPass Rate:\s*([\d.]+)%\[22m\[39m/) ||
        trimmed.match(/Pass Rate:\s*([\d.]+)%/);
      if (passRateMatch) {
        data.results.passRate = parseFloat(passRateMatch[1]);
      }

      // Instructions
      if (
        trimmed.includes('promptfoo view') ||
        trimmed.includes('promptfoo.app') ||
        trimmed.includes('promptfoo redteam report')
      ) {
        data.instructions.push(trimmed);
      }
    }

    return data;
  }, []);

  // Parse test generation data from logs and table
  const parseTestGenerationData = useCallback((content: string[], tableContent?: string[]) => {
    const data = {
      cacheEnabled: true,
      promptCount: 0,
      plugins: [] as Array<{ name: string; tests: number }>,
      strategies: [] as string[],
      summary: {
        totalTests: 0,
        pluginTests: 0,
        pluginsCount: 0,
        strategiesCount: 0,
        maxConcurrency: 0,
      },
      generationStatus: [] as Array<{
        plugin: string;
        status: 'generating' | 'completed';
        tests?: number;
      }>,
      tableResults: [] as Array<{
        id: string;
        type: string;
        requested: number;
        generated: number;
        status: string;
      }>,
    };

    // Parse main content
    for (const line of content) {
      const trimmed = line.trim();

      // Cache status
      if (trimmed.includes('Cache is disabled')) {
        data.cacheEnabled = false;
      }

      // Prompt count
      const promptMatch = trimmed.match(/Synthesizing test cases for (\d+) prompt/);
      if (promptMatch) {
        data.promptCount = parseInt(promptMatch[1]);
      }

      // Summary data
      const totalTestsMatch = trimmed.match(/Total tests:\s*\[36m(\d+)\[39m/);
      if (totalTestsMatch) {
        data.summary.totalTests = parseInt(totalTestsMatch[1]);
      }

      const pluginTestsMatch = trimmed.match(/Plugin tests:\s*\[36m(\d+)\[39m/);
      if (pluginTestsMatch) {
        data.summary.pluginTests = parseInt(pluginTestsMatch[1]);
      }

      const pluginsCountMatch = trimmed.match(/Plugins:\s*\[36m(\d+)\[39m/);
      if (pluginsCountMatch) {
        data.summary.pluginsCount = parseInt(pluginsCountMatch[1]);
      }

      const strategiesCountMatch = trimmed.match(/Strategies:\s*\[36m(\d+)\[39m/);
      if (strategiesCountMatch) {
        data.summary.strategiesCount = parseInt(strategiesCountMatch[1]);
      }

      const concurrencyMatch = trimmed.match(/Max concurrency:\s*\[36m(\d+)\[39m/);
      if (concurrencyMatch) {
        data.summary.maxConcurrency = parseInt(concurrencyMatch[1]);
      }

      // Generation status
      const generatingMatch = trimmed.match(/Generating tests for (.+)\.\.\./);
      if (generatingMatch) {
        const plugin = generatingMatch[1];
        if (!data.generationStatus.find((s) => s.plugin === plugin)) {
          data.generationStatus.push({ plugin, status: 'generating' });
        }
      }

      const completedMatch = trimmed.match(/Generated (\d+) tests for (.+)/);
      if (completedMatch) {
        const tests = parseInt(completedMatch[1]);
        const plugin = completedMatch[2];
        const existing = data.generationStatus.find((s) => s.plugin === plugin);
        if (existing) {
          existing.status = 'completed';
          existing.tests = tests;
        } else {
          data.generationStatus.push({ plugin, status: 'completed', tests });
        }
      }
    }

    // Parse table content if available
    if (tableContent) {
      for (const line of tableContent) {
        // Parse table rows with plugin data
        const rowMatch = line.match(
          /│\s*(\d+)\s*│\s*(Plugin)\s*│\s*([^│]+?)\s*│\s*(\d+)\s*│\s*(\d+)\s*│\s*\[32m(.*?)\[39m\s*│/,
        );
        if (rowMatch) {
          data.tableResults.push({
            id: rowMatch[3].trim(),
            type: rowMatch[2],
            requested: parseInt(rowMatch[4]),
            generated: parseInt(rowMatch[5]),
            status: rowMatch[6].trim(),
          });
        }
      }
    }

    return data;
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (shouldAutoScroll) {
      if (logsContainerRef.current) {
        const container = logsContainerRef.current;
        container.scrollTop = container.scrollHeight;
      }
      if (fullscreenLogsContainerRef.current) {
        const container = fullscreenLogsContainerRef.current;
        container.scrollTop = container.scrollHeight;
      }
    } else {
      // Restore previous scroll positions
      if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = previousScrollPositionRef.current.main;
      }
      if (fullscreenLogsContainerRef.current) {
        fullscreenLogsContainerRef.current.scrollTop = previousScrollPositionRef.current.fullscreen;
      }
    }
  }, [logs, shouldAutoScroll]);

  const scrollToBottom = useCallback((containerRef: React.RefObject<HTMLDivElement | null>) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setShouldAutoScroll(true);
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (logsContainerRef.current) {
      const container = logsContainerRef.current;
      const isAtBottom =
        Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50;
      setShouldAutoScroll(isAtBottom);
      setShowScrollButton(!isAtBottom);
      previousScrollPositionRef.current.main = container.scrollTop;
    }
  }, []);

  const handleFullscreenScroll = useCallback(() => {
    if (fullscreenLogsContainerRef.current) {
      const container = fullscreenLogsContainerRef.current;
      const isAtBottom =
        Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50;
      setShouldAutoScroll(isAtBottom);
      setShowScrollButton(!isAtBottom);
      previousScrollPositionRef.current.fullscreen = container.scrollTop;
    }
  }, []);

  const handleOpenFullscreen = () => setIsFullscreen(true);
  const handleCloseFullscreen = () => setIsFullscreen(false);

  const handleCopyLogs = useCallback(() => {
    const plainText = logs.join('\n');
    navigator.clipboard.writeText(plainText).then(
      () => {
        toast.showToast('Logs copied to clipboard', 'success');
      },
      (err) => {
        console.error('Failed to copy logs:', err);
        toast.showToast('Failed to copy logs to clipboard', 'error');
      },
    );
  }, [logs, toast]);

  const handleSaveLogs = useCallback(() => {
    const plainText = logs.join('\n');
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'redteam-logs.txt';
    link.click();
    URL.revokeObjectURL(url);
    toast.showToast('Logs saved successfully', 'success');
  }, [logs, toast]);

  const renderSection = useCallback(
    (section: LogSection, index: number) => {
      const sectionId = `section-${index}`;
      const isExpanded = expandedSections.has(sectionId);

      // Status updates don't need accordions - show as chips
      if (section.type === 'status-update') {
        return (
          <Box key={sectionId} sx={{ mb: 1 }}>
            <Chip label={section.title} color="info" variant="outlined" size="small" />
          </Box>
        );
      }

      // Separators don't need accordions
      if (section.type === 'separator') {
        return <Divider key={sectionId} sx={{ my: 2 }} />;
      }

      // Get section title and icon
      const getSectionTitle = () => {
        switch (section.type) {
          case 'test-generation':
            return 'Test Generation';
          case 'test-execution':
            return 'Test Execution';
          case 'phase':
            return section.title || 'Phase';
          case 'plugin-list':
            return section.title || 'Plugins';
          case 'table':
            return section.title || 'Report';
          case 'summary':
            return section.title || 'Summary';
          default:
            return 'Details';
        }
      };

      const getSectionIcon = () => {
        if (section.type === 'test-execution' && section.progress) {
          const percentage = (section.progress.current / section.progress.total) * 100;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', mr: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                {section.progress.current}/{section.progress.total}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={percentage}
                sx={{ width: 60, height: 4, borderRadius: 2 }}
              />
            </Box>
          );
        }
        return null;
      };

      // Render section content
      const renderSectionContent = () => {
        switch (section.type) {
          case 'test-execution':
            const progress = section.progress;
            const percentage = progress ? (progress.current / progress.total) * 100 : 0;

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Execution Status Card */}
                {progress && (
                  <Card variant="outlined">
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                        Execution Progress
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={percentage}
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 'bold', minWidth: 'fit-content' }}
                        >
                          {progress.current}/{progress.total} ({Math.round(percentage)}%)
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {progress.current === progress.total
                          ? 'All tests completed'
                          : `Running test ${progress.current} of ${progress.total}`}
                      </Typography>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Test Logs */}
                <Card variant="outlined">
                  <CardContent sx={{ pb: '16px !important' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Recent Activity
                    </Typography>
                    <Box
                      sx={{
                        maxHeight: '300px',
                        overflow: 'auto',
                        backgroundColor: theme.palette.action.hover,
                        borderRadius: 1,
                        p: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                      }}
                    >
                      {section.content.slice(-15).map((line, i) => (
                        <Typography
                          key={i}
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                          }}
                          dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            );

          case 'test-generation':
            const testData = parseTestGenerationData(section.content, section.relatedContent);

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Configuration Info */}
                <Card variant="outlined">
                  <CardContent sx={{ pb: '16px !important' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Configuration
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">Cache:</Typography>
                          <Chip
                            label={testData.cacheEnabled ? 'Enabled' : 'Disabled'}
                            color={testData.cacheEnabled ? 'success' : 'warning'}
                            size="small"
                          />
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2">
                          <strong>Prompts:</strong> {testData.promptCount}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                {/* Test Generation Summary */}
                {testData.summary.totalTests > 0 && (
                  <Card variant="outlined">
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                        Test Generation Summary
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" color="primary" sx={{ fontWeight: 'bold' }}>
                              {testData.summary.totalTests}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Total Tests
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" color="secondary" sx={{ fontWeight: 'bold' }}>
                              {testData.summary.pluginsCount}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Plugins
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" color="info.main" sx={{ fontWeight: 'bold' }}>
                              {testData.summary.strategiesCount}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Strategies
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography
                              variant="h4"
                              color="success.main"
                              sx={{ fontWeight: 'bold' }}
                            >
                              {testData.summary.maxConcurrency}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Max Concurrency
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                )}

                {/* Plugin Generation Results */}
                {(testData.generationStatus.length > 0 || testData.tableResults.length > 0) && (
                  <Card variant="outlined">
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                        Plugin Results
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {/* Show table results if available, otherwise show generation status */}
                        {testData.tableResults.length > 0
                          ? testData.tableResults.map((item, i) => (
                              <Box
                                key={i}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  p: 1,
                                  backgroundColor: theme.palette.action.hover,
                                  borderRadius: 1,
                                }}
                              >
                                <Box sx={{ minWidth: '200px' }}>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                                  >
                                    {item.id}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {item.requested} requested
                                  </Typography>
                                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    •
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                    {item.generated} generated
                                  </Typography>
                                </Box>
                                <Chip
                                  label={`✓ ${item.status}`}
                                  color="success"
                                  size="small"
                                  variant="filled"
                                />
                              </Box>
                            ))
                          : testData.generationStatus.map((item, i) => (
                              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ minWidth: '200px' }}>
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                    {item.plugin}
                                  </Typography>
                                </Box>
                                <Chip
                                  label={
                                    item.status === 'completed'
                                      ? `✓ ${item.tests} tests`
                                      : 'Generating...'
                                  }
                                  color={item.status === 'completed' ? 'success' : 'default'}
                                  size="small"
                                  variant={item.status === 'completed' ? 'filled' : 'outlined'}
                                />
                              </Box>
                            ))}
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </Box>
            );

          case 'phase':
            // Default phase rendering for non-test-generation phases
            return (
              <Box>
                {section.content.length > 1 && (
                  <Box sx={{ pl: 2 }}>
                    {section.content.slice(1).map((line, i) => (
                      <Typography
                        key={i}
                        variant="body2"
                        sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                        dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            );

          case 'plugin-list':
            return (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {section.content.map((line, i) => {
                  const match = line.match(/\[33m(\w+[^(]*)\s*\((\d+)\s+tests\)\[39m/);
                  if (match) {
                    return (
                      <Chip
                        key={i}
                        label={`${match[1]} (${match[2]} tests)`}
                        color="warning"
                        variant="outlined"
                        size="small"
                      />
                    );
                  }
                  return null;
                })}
              </Box>
            );

          case 'table':
            return (
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 1,
                  overflow: 'auto',
                }}
              >
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    whiteSpace: 'pre',
                    margin: 0,
                    '& span': {
                      color: theme.palette.mode === 'dark' ? 'inherit' : undefined,
                    },
                  }}
                  dangerouslySetInnerHTML={{
                    __html: section.content.map((line) => convertAnsiToHtml(line)).join('\n'),
                  }}
                />
              </Paper>
            );

          case 'summary':
            const summaryData = parseSummaryData(section.content);

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Completion Status */}
                {summaryData.completionMessage && (
                  <Card variant="outlined">
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Typography
                          variant="h6"
                          sx={{ color: theme.palette.success.main, fontWeight: 'bold' }}
                        >
                          🎉 {summaryData.completionMessage}
                        </Typography>
                      </Box>
                      {summaryData.evaluationId && (
                        <Typography variant="body2" color="text.secondary">
                          Evaluation ID: <code>{summaryData.evaluationId}</code>
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Results Overview */}
                <Card variant="outlined">
                  <CardContent sx={{ pb: '16px !important' }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                      Test Results
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            variant="h3"
                            sx={{ color: theme.palette.success.main, fontWeight: 'bold' }}
                          >
                            {summaryData.results.passRate.toFixed(1)}%
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Pass Rate
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            variant="h4"
                            sx={{ color: theme.palette.success.main, fontWeight: 'bold' }}
                          >
                            {summaryData.results.successes}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Successes
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            variant="h4"
                            sx={{ color: theme.palette.error.main, fontWeight: 'bold' }}
                          >
                            {summaryData.results.failures}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Failures
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            variant="h4"
                            sx={{ color: theme.palette.warning.main, fontWeight: 'bold' }}
                          >
                            {summaryData.results.errors}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Errors
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                    {summaryData.duration && (
                      <Box sx={{ mt: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          Duration: <strong>{summaryData.duration}</strong>
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>

                {/* Token Usage */}
                {summaryData.tokenUsage.grandTotal > 0 && (
                  <Card variant="outlined">
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                        Token Usage
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          mb: 2,
                        }}
                      >
                        <Typography
                          variant="h4"
                          sx={{ fontWeight: 'bold', color: theme.palette.primary.main }}
                        >
                          {summaryData.tokenUsage.grandTotal.toLocaleString()}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Total Tokens
                        </Typography>
                      </Box>
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Box
                            sx={{
                              textAlign: 'center',
                              p: 1,
                              backgroundColor: theme.palette.action.hover,
                              borderRadius: 1,
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {summaryData.tokenUsage.probes.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Probes
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box
                            sx={{
                              textAlign: 'center',
                              p: 1,
                              backgroundColor: theme.palette.action.hover,
                              borderRadius: 1,
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {summaryData.tokenUsage.evaluation.total.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Evaluation
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box
                            sx={{
                              textAlign: 'center',
                              p: 1,
                              backgroundColor: theme.palette.action.hover,
                              borderRadius: 1,
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {summaryData.tokenUsage.grading.total.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Grading
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <Card variant="outlined">
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Next Steps
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      View detailed results, analyze your evaluation, or share findings with your
                      team.
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ p: 2, pt: 0, gap: 1 }}>
                    <Button
                      variant="contained"
                      startIcon={<VisibilityIcon />}
                      onClick={() => {
                        // Navigate to report view
                        console.log('Navigate to report');
                      }}
                    >
                      View Report
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<AssessmentIcon />}
                      onClick={() => {
                        // Navigate to eval
                        console.log('Navigate to eval');
                      }}
                    >
                      Analyze Eval
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<ShareIcon />}
                      onClick={() => {
                        // Share functionality
                        console.log('Share results');
                        toast.showToast('Share functionality coming soon!', 'info');
                      }}
                    >
                      Share
                    </Button>
                  </CardActions>
                </Card>
              </Box>
            );

          case 'regular':
          default:
            return (
              <Box>
                {section.content.map((line, i) => (
                  <Typography
                    key={i}
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      '& span': {
                        color: theme.palette.mode === 'dark' ? 'inherit' : undefined,
                      },
                    }}
                    dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
                  />
                ))}
              </Box>
            );
        }
      };

      // Return accordion for all other section types
      return (
        <Accordion
          key={sectionId}
          expanded={isExpanded}
          onChange={handleAccordionChange(sectionId)}
          sx={{
            mb: 1,
            '&.MuiAccordion-root': {
              boxShadow: 1,
            },
            '&.MuiAccordion-root.Mui-expanded': {
              boxShadow: 2,
            },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              '& .MuiAccordionSummary-content': {
                alignItems: 'center',
                gap: 1,
              },
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 'bold',
                color:
                  section.type === 'summary'
                    ? theme.palette.success.main
                    : section.type === 'phase'
                      ? theme.palette.primary.main
                      : section.type === 'test-generation'
                        ? theme.palette.secondary.main
                        : section.type === 'test-execution'
                          ? theme.palette.info.main
                          : 'inherit',
              }}
            >
              {getSectionTitle()}
            </Typography>
            {getSectionIcon()}
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>{renderSectionContent()}</AccordionDetails>
        </Accordion>
      );
    },
    [convertAnsiToHtml, theme, expandedSections, handleAccordionChange],
  );

  const LogContent = useCallback(
    ({ containerRef, onScroll, sx }: any) => (
      <Box
        ref={containerRef}
        onScroll={onScroll}
        sx={{
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          borderRadius: 1,
          ...sx,
        }}
      >
        {parseLogSections.map((section, index) => renderSection(section, index))}
      </Box>
    ),
    [parseLogSections, renderSection, theme.palette.mode],
  );

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, mb: 1 }}>
        <Typography variant="subtitle2">Logs</Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyLogs}>
            Copy
          </Button>
          <Button size="small" startIcon={<DownloadIcon />} onClick={handleSaveLogs}>
            Save
          </Button>
          <Button size="small" startIcon={<FullscreenIcon />} onClick={handleOpenFullscreen}>
            Fullscreen
          </Button>
        </Box>
      </Box>

      <Box sx={{ position: 'relative' }}>
        <LogContent containerRef={logsContainerRef} onScroll={handleScroll} sx={{ p: 2 }} />
        {showScrollButton && !isFullscreen && (
          <Fab
            size="small"
            color="primary"
            sx={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              zIndex: 1,
            }}
            onClick={() => scrollToBottom(logsContainerRef)}
          >
            <KeyboardDoubleArrowDownIcon />
          </Fab>
        )}
      </Box>

      <Dialog
        open={isFullscreen}
        onClose={handleCloseFullscreen}
        maxWidth={false}
        fullWidth
        fullScreen
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            Logs
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyLogs}>
                Copy
              </Button>
              <Button size="small" startIcon={<DownloadIcon />} onClick={handleSaveLogs}>
                Save
              </Button>
              <Button size="small" onClick={handleCloseFullscreen}>
                Exit Fullscreen
              </Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <LogContent
            containerRef={fullscreenLogsContainerRef}
            onScroll={handleFullscreenScroll}
            sx={{ p: 3 }}
          />
          {showScrollButton && isFullscreen && (
            <Fab
              size="small"
              color="primary"
              sx={{
                position: 'fixed',
                right: 16,
                bottom: 16,
                zIndex: 1,
              }}
              onClick={() => scrollToBottom(fullscreenLogsContainerRef)}
            >
              <KeyboardDoubleArrowDownIcon />
            </Fab>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
