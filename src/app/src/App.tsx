import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from 'react-router-dom';
import PageShell from './components/PageShell';
// NOTE(mldangelo): Dashboard feature is currently under development
// import DashboardPage from './pages/dashboard/page';
import DatasetsPage from './pages/datasets/page';
import EvalCreatorPage from './pages/eval-creator/page';
import EvalPage from './pages/eval/page';
import ProgressPage from './pages/progress/page';
import PromptsPage from './pages/prompts/page';
import ReportPage from './pages/report/page';
import './App.css';

const DEFAULT_ROUTE = import.meta.env.VITE_PUBLIC_HOSTED ? '/setup' : '/eval';

const router = createBrowserRouter(
  createRoutesFromElements([
    <Route path="/" element={<PageShell />}>
      <Route index element={<Navigate to={DEFAULT_ROUTE} replace />} />
      <Route path="/eval" element={<EvalPage />} />
      <Route path="/eval/:evalId" element={<EvalPage />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/setup" element={<EvalCreatorPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/report" element={<ReportPage />} />
      {/* <Route path="/dashboard" element={<DashboardPage />} /> */}
    </Route>,
  ]),
);
function App() {
  return <RouterProvider router={router} />;
}

export default App;
