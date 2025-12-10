import { useEffect } from 'react';

import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/PageShell';
import { ToastProvider } from './contexts/ToastContext';
import { useTelemetry } from './hooks/useTelemetry';
import DatasetsPage from './pages/datasets/page';
import EvalPage from './pages/eval/page';
import EvalCreatorPage from './pages/eval-creator/page';
import EvalsIndexPage from './pages/evals/page';
import HistoryPage from './pages/history/page';
import LauncherPage from './pages/launcher/page';
import LoginPage from './pages/login';
import ModelAuditHistoryPage from './pages/model-audit-history/page';
import ModelAuditLatestPage from './pages/model-audit-latest/page';
import ModelAuditResultPage from './pages/model-audit-result/page';
import ModelAuditSetupPage from './pages/model-audit-setup/page';
import NotFoundPage from './pages/NotFoundPage';
import PromptsPage from './pages/prompts/page';
import ReportPage from './pages/redteam/report/page';
import RedteamSetupPage from './pages/redteam/setup/page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const basename = import.meta.env.VITE_PUBLIC_BASENAME || '';

function TelemetryTracker() {
  const location = useLocation();
  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { path: location.pathname });
  }, [location.pathname, recordEvent]);

  return <Outlet />;
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
          <Route path="/evals" element={<EvalsIndexPage />} />
          <Route path="/eval/:evalId" element={<EvalPage />} />

          {/* Redirect legacy /progress route to /history (since v0.104.5) */}
          <Route path="/progress" element={<Navigate to="/history" replace />} />
          <Route path="/history" element={<HistoryPage />} />

          <Route path="/prompts" element={<PromptsPage />} />

          {/* Model Audit routes - mirrors eval structure */}
          <Route path="/model-audit" element={<ModelAuditLatestPage />} />
          <Route path="/model-audits" element={<ModelAuditHistoryPage />} />
          <Route path="/model-audit/setup" element={<ModelAuditSetupPage />} />
          <Route path="/model-audit/:id" element={<ModelAuditResultPage />} />
          {/* Redirect legacy /model-audit/history route */}
          <Route path="/model-audit/history" element={<Navigate to="/model-audits" replace />} />

          <Route path="/redteam" element={<Navigate to="/redteam/setup" replace />} />
          <Route path="/redteam/setup" element={<RedteamSetupPage />} />

          {/* Redirect legacy /report route to /reports (since v0.118.2) */}
          <Route path="/report" element={<Navigate to="/reports" replace />} />
          <Route path="/reports" element={<ReportPage />} />
          <Route path="/setup" element={<EvalCreatorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </>,
  ),
  { basename },
);

const queryClient = new QueryClient();

function App() {
  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ToastProvider>
  );
}

export default App;
