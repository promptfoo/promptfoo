import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';

import { usePageMeta } from '@app/hooks/usePageMeta';
import { useUserStore } from '@app/stores/userStore';
import { callApi } from '@app/utils/api';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HistoryDataGrid from '../history/HistoryDataGrid';
import RedTeamsDataGrid from './components/RedTeamsDataGrid';
import type { StandaloneEval } from '@promptfoo/util/database';
import type { EvalSummary } from '@promptfoo/types';

const TAB_VALUES = {
  EVALS: 'evals',
  RED_TEAMS: 'redteams',
} as const;

type TabValue = (typeof TAB_VALUES)[keyof typeof TAB_VALUES];

function TabPanel({
  value,
  current,
  children,
}: {
  value: TabValue;
  current: TabValue;
  children: React.ReactNode;
}) {
  if (value !== current) {
    return null;
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</Box>
  );
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get('tab') || '').toLowerCase();
  const activeTab = tabParam === TAB_VALUES.RED_TEAMS ? TAB_VALUES.RED_TEAMS : TAB_VALUES.EVALS;

  const [historyData, setHistoryData] = useState<StandaloneEval[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [redteamData, setRedteamData] = useState<EvalSummary[]>([]);
  const [isRedteamLoading, setIsRedteamLoading] = useState(false);
  const [redteamError, setRedteamError] = useState<Error | null>(null);
  const [hasLoadedRedteams, setHasLoadedRedteams] = useState(false);

  const { email, isLoading: isUserLoading, fetchEmail } = useUserStore();

  usePageMeta({
    title: 'Results',
    description: 'Browse evaluation history and red team reports',
  });

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const fetchHistory = useCallback(
    async (signal?: AbortSignal) => {
      setIsHistoryLoading(true);
      setHistoryError(null);
      try {
        const response = await callApi('/history', { signal });
        if (!response.ok) {
          throw new Error('Failed to load history data. Please try again.');
        }
        const data = await response.json();
        setHistoryData(Array.isArray(data?.data) ? data.data : []);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        setHistoryError('Failed to load history data. Please try again.');
      } finally {
        if (!signal?.aborted) {
          setIsHistoryLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => controller.abort();
  }, [fetchHistory]);

  const fetchRedteamData = useCallback(async () => {
    setIsRedteamLoading(true);
    setRedteamError(null);
    try {
      const resp = await callApi('/results?type=redteam&includeProviders=true', {
        cache: 'no-store',
      });
      if (!resp.ok) {
        throw new Error(`${resp.status}: ${resp.statusText}`);
      }
      const body = (await resp.json()) as { data: EvalSummary[] };
      setRedteamData(body.data);
    } catch (error) {
      setRedteamError(error as Error);
    } finally {
      setIsRedteamLoading(false);
      setHasLoadedRedteams(true);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== TAB_VALUES.RED_TEAMS) {
      return;
    }
    if (isUserLoading) {
      return;
    }
    if (!email) {
      const redirectPath = `${window.location.pathname}${window.location.search}`;
      navigate(`/login?type=report&redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }
    if (!hasLoadedRedteams) {
      fetchRedteamData();
    }
  }, [activeTab, email, fetchRedteamData, hasLoadedRedteams, isUserLoading, navigate]);

  const handleTabChange = useCallback(
    (_event: SyntheticEvent, newValue: TabValue) => {
      const params = new URLSearchParams(searchParams);
      params.set('tab', newValue);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleRedteamRefresh = useCallback(() => {
    setHasLoadedRedteams(false);
    fetchRedteamData();
  }, [fetchRedteamData]);

  const historyContent = useMemo(
    () => (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, px: 3, pb: 3 }}>
        <HistoryDataGrid data={historyData} isLoading={isHistoryLoading} error={historyError} />
      </Box>
    ),
    [historyData, historyError, isHistoryLoading],
  );

  const redteamContent = useMemo(() => {
    if (isUserLoading) {
      return (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            px: 3,
            pb: 3,
          }}
        >
          <CircularProgress size={22} />
          <Typography variant="body2" color="text.secondary">
            Checking access…
          </Typography>
        </Box>
      );
    }

    if (!email) {
      return null;
    }

    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 2, px: 3, pb: 3 }}>
        {redteamError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={handleRedteamRefresh} disabled={isRedteamLoading}>
                Retry
              </Button>
            }
          >
            {redteamError.message}
          </Alert>
        )}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <RedTeamsDataGrid
            data={redteamData}
            isLoading={isRedteamLoading}
            onRowSelected={(evalId) => navigate(`/eval/${evalId}`)}
          />
        </Box>
      </Box>
    );
  }, [email, handleRedteamRefresh, isRedteamLoading, isUserLoading, navigate, redteamData, redteamError]);

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.black, 0.2)
            : alpha(theme.palette.grey[50], 0.5),
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderTop: 1,
          borderColor: (theme) => alpha(theme.palette.divider, 0.1),
          boxShadow: (theme) => `0 1px 2px ${alpha(theme.palette.common.black, 0.05)}`,
          bgcolor: 'background.paper',
          borderRadius: 1,
        }}
      >
        <Box sx={{ px: 3, pt: 3, pb: 1.5, borderBottom: (theme) => `1px solid ${alpha(theme.palette.divider, 0.2)}` }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
            Results
          </Typography>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="Results tabs"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
              },
            }}
          >
            <Tab label="Evals" value={TAB_VALUES.EVALS} />
            <Tab label="Red Teams" value={TAB_VALUES.RED_TEAMS} />
          </Tabs>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TabPanel value={TAB_VALUES.EVALS} current={activeTab}>
            {historyContent}
          </TabPanel>
          <TabPanel value={TAB_VALUES.RED_TEAMS} current={activeTab}>
            {redteamContent}
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
}
