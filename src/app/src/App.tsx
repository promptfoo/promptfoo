import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router-dom';
import PageShell from './components/PageShell';
import DatasetsPage from './pages/datasets/page';
import EvalCreatorPage from './pages/eval-creator/page';
import EvalPage from './pages/eval/page';
import ProgressPage from './pages/progress/page';
import PromptsPage from './pages/prompts/page';
import ReportPage from './pages/report/page';
import './App.css';

const router = createBrowserRouter(
  createRoutesFromElements([
    <Route path="/" element={<PageShell />}>
      <Route path="/eval" element={<EvalPage />} />
      <Route path="/eval/:evalId" element={<EvalPage />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/setup" element={<EvalCreatorPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/report" element={<ReportPage />} />
    </Route>,
  ]),
);
function App() {
  return <RouterProvider router={router} />;
}

export default App;
