import Box from '@mui/material/Box';
import type { ReactNode } from 'react';

interface UnifiedLayoutWrapperProps {
  children: ReactNode;
}

/**
 * Wrapper component that provides the unified flexbox layout for specific pages
 * that were designed to work within height-constrained containers.
 *
 * This wrapper should only be used for pages like /prompts, /history, /datasets, /evals
 * that use `height: '100%'` in their Container components.
 */
export default function UnifiedLayoutWrapper({ children }: UnifiedLayoutWrapperProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}