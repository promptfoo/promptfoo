import { TooltipProvider } from '@app/components/ui/tooltip';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// Helper to render with TooltipProvider and MemoryRouter
export function renderWithRouter(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </TooltipProvider>,
  );
}
