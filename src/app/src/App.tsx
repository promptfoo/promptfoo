import { lazy, Suspense, useEffect } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { Spinner } from './components/ui/spinner';
import { TooltipProvider } from './components/ui/tooltip';
import {
  EVAL_ROUTES,
  LAUNCHER_ROUTES,
  MODEL_AUDIT_ROUTES,
  REDTEAM_ROUTES,
  ROUTES,
} from './constants/routes';
import { ToastProvider } from './contexts/ToastContext';
import { useTelemetry } from './hooks/useTelemetry';

const DatasetsPage = lazy(() => import('./pages/datasets/page'));
const EvalPage = lazy(() => import('./pages/eval/page'));
const EvalCreatorPage = lazy(() => import('./pages/eval-creator/page'));
const EvalsIndexPage = lazy(() => import('./pages/evals/page'));
const HistoryPage = lazy(() => import('./pages/history/page'));
const LauncherPage = lazy(() => import('./pages/launcher/page'));
const LoginPage = lazy(() => import('./pages/login'));
const ModelAuditHistoryPage = lazy(() => import('./pages/model-audit-history/page'));
const ModelAuditLatestPage = lazy(() => import('./pages/model-audit-latest/page'));
const ModelAuditResultPage = lazy(() => import('./pages/model-audit-result/page'));
const ModelAuditSetupPage = lazy(() => import('./pages/model-audit-setup/page'));
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
        <Route
          path={LAUNCHER_ROUTES.ROOT}
          element={
            <ErrorBoundary name="Launcher">
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <LauncherPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
      )}
      <Route path={ROUTES.HOME} element={<PageShell />}>
        <Route element={<TelemetryTracker />}>
          <Route
            index
            element={
              <Navigate
                to={
                  import.meta.env.VITE_PROMPTFOO_LAUNCHER ? LAUNCHER_ROUTES.ROOT : EVAL_ROUTES.ROOT
                }
                replace
              />
            }
          />
          <Route
            path={ROUTES.DATASETS}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <DatasetsPage />
              </Suspense>
            }
          />
          <Route
            path={EVAL_ROUTES.ROOT}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <EvalPage />
              </Suspense>
            }
          />
          <Route
            path={EVAL_ROUTES.LIST}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <EvalsIndexPage />
              </Suspense>
            }
          />
          <Route
            path="/eval/:evalId"
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <EvalPage />
              </Suspense>
            }
          />

          {/* Redirect legacy /progress route to /history (since v0.104.5) */}
          <Route path="/progress" element={<Navigate to={ROUTES.HISTORY} replace />} />
          <Route
            path={ROUTES.HISTORY}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <HistoryPage />
              </Suspense>
            }
          />

          <Route
            path={ROUTES.PROMPTS}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <PromptsPage />
              </Suspense>
            }
          />

          {/* Model Audit routes - mirrors eval structure */}
          <Route
            path={MODEL_AUDIT_ROUTES.ROOT}
            element={
              <ErrorBoundary name="Model Audit">
                <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                  <ModelAuditLatestPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path={MODEL_AUDIT_ROUTES.LIST}
            element={
              <ErrorBoundary name="Model Audit History">
                <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                  <ModelAuditHistoryPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path={MODEL_AUDIT_ROUTES.SETUP}
            element={
              <ErrorBoundary name="Model Audit Setup">
                <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                  <ModelAuditSetupPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/model-audit/:id"
            element={
              <ErrorBoundary name="Model Audit Result">
                <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                  <ModelAuditResultPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          {/* Redirect legacy /model-audit/history route */}
          <Route
            path="/model-audit/history"
            element={<Navigate to={MODEL_AUDIT_ROUTES.LIST} replace />}
          />

          <Route
            path={REDTEAM_ROUTES.ROOT}
            element={<Navigate to={REDTEAM_ROUTES.SETUP} replace />}
          />
          <Route
            path={REDTEAM_ROUTES.SETUP}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <RedteamSetupPage />
              </Suspense>
            }
          />

          {/* Redirect legacy /report route to /reports (since v0.118.2) */}
          <Route path="/report" element={<Navigate to={REDTEAM_ROUTES.REPORTS} replace />} />
          <Route
            path={REDTEAM_ROUTES.REPORTS}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <ReportPage />
              </Suspense>
            }
          />
          <Route
            path={ROUTES.SETUP}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <EvalCreatorPage />
              </Suspense>
            }
          />
          <Route
            path={ROUTES.LOGIN}
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <LoginPage />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<Spinner size="lg" className="h-screen" />}>
                <NotFoundPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
    </>,
  ),
  { basename },
);

const queryClient = new QueryClient();

function App() {
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={0}>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}

export default App;
