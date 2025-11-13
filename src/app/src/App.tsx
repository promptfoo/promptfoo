import { useEffect, lazy, Suspense } from 'react';

import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import PageShell from './components/PageShell';
import PageLoading from './components/PageLoading';
import { ToastProvider } from './contexts/ToastContext';
import { useTelemetry } from './hooks/useTelemetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Lazy load pages for better code splitting
const DatasetsPage = lazy(() => import('./pages/datasets/page'));
const EvalPage = lazy(() => import('./pages/eval/page'));
const EvalCreatorPage = lazy(() => import('./pages/eval-creator/page'));
const EvalsIndexPage = lazy(() => import('./pages/evals/page'));
const HistoryPage = lazy(() => import('./pages/history/page'));
const LauncherPage = lazy(() => import('./pages/launcher/page'));
const LoginPage = lazy(() => import('./pages/login'));
const ModelAuditPage = lazy(() => import('./pages/model-audit/page'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PromptsPage = lazy(() => import('./pages/prompts/page'));
const ReportPage = lazy(() => import('./pages/redteam/report/page'));
const RedteamSetupPage = lazy(() => import('./pages/redteam/setup/page'));

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
          <Route path="/model-audit" element={<ModelAuditPage />} />
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
        <Suspense fallback={<PageLoading />}>
          <RouterProvider router={router} />
        </Suspense>
      </QueryClientProvider>
    </ToastProvider>
  );
}

export default App;
