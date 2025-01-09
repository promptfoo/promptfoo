import { useEffect } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
  useLocation,
  Outlet,
} from 'react-router-dom';
import { Alert, Collapse } from '@mui/material';
import PageShell from './components/PageShell';
import { ToastProvider } from './contexts/ToastContext';
import { useApiHealth } from './hooks/useApiHealth';
import { useTelemetry } from './hooks/useTelemetry';
import DatasetsPage from './pages/datasets/page';
import EvalCreatorPage from './pages/eval-creator/page';
import EvalPage from './pages/eval/page';
import LauncherPage from './pages/launcher/page';
import LoginPage from './pages/login';
import ProgressPage from './pages/progress/page';
import PromptsPage from './pages/prompts/page';
import ReportPage from './pages/redteam/report/page';
import RedteamSetupPage from './pages/redteam/setup/page';

const basename = import.meta.env.VITE_PUBLIC_BASENAME || '';

function TelemetryTracker() {
  const location = useLocation();
  const { recordEvent } = useTelemetry();
  const { status: healthStatus, hasBeenConnected, isInitialConnection } = useApiHealth(true, 5000);

  useEffect(() => {
    recordEvent('webui_page_view', { path: location.pathname });
  }, [location, recordEvent]);

  return (
    <>
      <Collapse
        in={
          hasBeenConnected &&
          !isInitialConnection &&
          healthStatus === 'blocked' &&
          location.pathname !== '/launcher'
        }
        sx={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          width: 'auto',
          maxWidth: '90vw',
        }}
      >
        <Alert severity="warning" sx={{ mb: 2 }}>
          Connection lost. Try visiting{' '}
          <a
            href="https://local.promptfoo.app"
            style={{ color: 'inherit' }}
            target="_blank"
            rel="noopener"
          >
            local.promptfoo.app
          </a>{' '}
          instead
        </Alert>
      </Collapse>
      <Outlet />
    </>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {import.meta.env.VITE_PROMPTFOO_LAUNCHER && (
        <Route path="/launcher" element={<LauncherPage />} />
      )}
      <Route path="/" element={<PageShell />}>
        <Route element={<TelemetryTracker />}>
          <Route
            index
            element={
              <Navigate
                to={import.meta.env.VITE_PROMPTFOO_LAUNCHER ? '/launcher' : '/eval'}
                replace
              />
            }
          />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/eval" element={<EvalPage />} />
          <Route path="/eval/:evalId" element={<EvalPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/prompts" element={<PromptsPage />} />
          <Route path="/redteam" element={<Navigate to="/redteam/setup" replace />} />
          <Route path="/redteam/setup" element={<RedteamSetupPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/setup" element={<EvalCreatorPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Route>
    </>,
  ),
  { basename },
);

function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}

export default App;
