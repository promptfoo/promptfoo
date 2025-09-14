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
import PageShell from './components/PageShell.js';
import { ToastProvider } from './contexts/ToastContext.js';
import { useTelemetry } from './hooks/useTelemetry.js';
import DatasetsPage from './pages/datasets/page.js';
import EvalPage from './pages/eval/page.js';
import EvalCreatorPage from './pages/eval-creator/page.js';
import EvalsIndexPage from './pages/evals/page.js';
import HistoryPage from './pages/history/page.js';
import LauncherPage from './pages/launcher/page.js';
import LoginPage from './pages/login.js';
import ModelAuditPage from './pages/model-audit/page.js';
import PromptsPage from './pages/prompts/page.js';
import ReportPage from './pages/redteam/report/page.js';
import RedteamSetupPage from './pages/redteam/setup/page.js';

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
