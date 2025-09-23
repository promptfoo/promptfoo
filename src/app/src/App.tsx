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
import PageShell from './components/PageShell';
import { ToastProvider } from './contexts/ToastContext';
import { useTelemetry } from './hooks/useTelemetry';
import DatasetsPage from './pages/datasets/page';
import EvalPage from './pages/eval/page';
import EvalCreatorPage from './pages/eval-creator/page';
import ResultsPage from './pages/results/page';
import LauncherPage from './pages/launcher/page';
import LoginPage from './pages/login';
import ModelAuditPage from './pages/model-audit/page';
import NotFoundPage from './pages/NotFoundPage';
import PromptsPage from './pages/prompts/page';
import RedteamSetupPage from './pages/redteam/setup/page';

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
          <Route path="/evals" element={<Navigate to="/results" replace />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/eval/:evalId" element={<EvalPage />} />

          {/* Redirect legacy /progress route to /results?tab=evals (since v0.104.5) */}
          <Route path="/progress" element={<Navigate to="/results?tab=evals" replace />} />
          <Route path="/history" element={<Navigate to="/results?tab=evals" replace />} />

          <Route path="/prompts" element={<PromptsPage />} />
          <Route path="/model-audit" element={<ModelAuditPage />} />
          <Route path="/redteam" element={<Navigate to="/redteam/setup" replace />} />
          <Route path="/redteam/setup" element={<RedteamSetupPage />} />

          {/* Redirect legacy /report route to /results?tab=redteams (since v0.118.2) */}
          <Route path="/report" element={<Navigate to="/results?tab=redteams" replace />} />
          <Route path="/reports" element={<Navigate to="/results?tab=redteams" replace />} />
          <Route path="/setup" element={<EvalCreatorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
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
