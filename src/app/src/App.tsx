import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { TooltipProvider } from './components/ui/tooltip';
import { EvalHistoryProvider } from './contexts/EvalHistoryContext';
import { ToastProvider } from './contexts/ToastContext';
import { createAppRoutes } from './routes';

const router = createBrowserRouter(createAppRoutes(), {
  basename: import.meta.env.VITE_PUBLIC_BASENAME || '',
});
const queryClient = new QueryClient();

function App() {
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={0}>
      <ToastProvider>
        <EvalHistoryProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </EvalHistoryProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}

export default App;
