import { lazy, Suspense, useEffect } from 'react';

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
import { ToastProvider } from './contexts/ToastContext';
import { useTelemetry } from './hooks/useTelemetry';
import EvalPage from './pages/eval/page';
import EvalCreatorPage from './pages/eval-creator/page';
import EvalsIndexPage from './pages/evals/page';
import LauncherPage from './pages/launcher/page';
import NotFoundPage from './pages/NotFoundPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Critical pages - loaded immediately with main bundle
// Non-critical pages - lazy loaded
const DatasetsPage = lazy(() => import('./pages/datasets/page'));
const HistoryPage = lazy(() => import('./pages/history/page'));
const LoginPage = lazy(() => import('./pages/login'));
const ModelAuditPage = lazy(() => import('./pages/model-audit/page'));
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

function LazyPageLoader() {
  return (
    <Suspense fallback={<PageShell />}>
      <Outlet />
    </Suspense>
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
          {/* Critical pages - loaded immediately */}
          <Route path="/eval" element={<EvalPage />} />
          <Route path="/evals" element={<EvalsIndexPage />} />
          <Route path="/eval/:evalId" element={<EvalPage />} />
          <Route path="/setup" element={<EvalCreatorPage />} />

          {/* Non-critical pages - lazy loaded */}
          <Route element={<LazyPageLoader />}>
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/progress" element={<Navigate to="/history" replace />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/model-audit" element={<ModelAuditPage />} />
            <Route path="/redteam" element={<Navigate to="/redteam/setup" replace />} />
            <Route path="/redteam/setup" element={<RedteamSetupPage />} />
            <Route path="/report" element={<Navigate to="/reports" replace />} />
            <Route path="/reports" element={<ReportPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
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
