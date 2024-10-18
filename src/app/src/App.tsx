import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from 'react-router-dom';
import PageShell from './components/PageShell';
import DatasetsPage from './pages/datasets/page';
import EvalCreatorPage from './pages/eval-creator/page';
import EvalPage from './pages/eval/page';
import ProgressPage from './pages/progress/page';
import PromptsPage from './pages/prompts/page';
import RedteamDashboardPage from './pages/redteam/dashboard/page';
import ReportPage from './pages/redteam/report/page';
import RedteamSetupPage from './pages/redteam/setup/page';

const basename = import.meta.env.VITE_PUBLIC_BASENAME || '';

const router = createBrowserRouter(
  createRoutesFromElements([
    <Route path="/" element={<PageShell />}>
      <Route index element={<Navigate to={'/eval'} replace />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/eval" element={<EvalPage />} />
      <Route path="/eval/:evalId" element={<EvalPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/redteam/setup" element={<RedteamSetupPage />} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="/setup" element={<EvalCreatorPage />} />
      {import.meta.env.VITE_PROMPTFOO_EXPERIMENTAL && (
        <>
          <Route path="/dashboard" element={<RedteamDashboardPage />} />
        </>
      )}
    </Route>,
  ]),
  { basename },
);
function App() {
  return <RouterProvider router={router} />;
}

export default App;
