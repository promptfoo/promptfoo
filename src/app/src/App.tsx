import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  useLocation,
  Outlet,
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
import RedteamSetupPage from './pages/redteam/setup/page';
import ReportPage from './pages/report/page';

const basename = import.meta.env.VITE_PUBLIC_BASENAME || '';

const useAuth = () => {
  return {
    user: true,
    isLoading: false,
    organization: true,
  };
};

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, organization } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div></div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!organization) {
    return <Navigate to="/organization/new" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const ProtectedRoutes = () => (
  <RequireAuth>
    <Outlet />
  </RequireAuth>
);

const router = createBrowserRouter(
  createRoutesFromElements([
    <Route path="/" element={<PageShell />}>
      <Route index element={<Navigate to={'/eval'} replace />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/eval" element={<EvalPage />} />
      <Route path="/eval/:evalId" element={<EvalPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/report" element={<Navigate to="/redteam/report" replace />} />
      <Route path="/setup" element={<EvalCreatorPage />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/redteam/report" element={<ReportPage />} />
        <Route path="/redteam/dashboard" element={<RedteamDashboardPage />} />
        <Route path="/redteam/setup" element={<RedteamSetupPage />} />
      </Route>
    </Route>,
  ]),
  { basename },
);
function App() {
  return <RouterProvider router={router} />;
}

export default App;
