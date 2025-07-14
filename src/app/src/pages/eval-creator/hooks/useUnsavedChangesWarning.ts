import { useEffect } from 'react';
import { useStore } from '@app/stores/evalConfig';

export function useUnsavedChangesWarning() {
  const { saveStatus, saveError } = useStore();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only warn if there's an active save operation or a save error
      if (saveStatus === 'saving' || saveStatus === 'error') {
        const message =
          saveStatus === 'saving'
            ? 'Changes are being saved. Are you sure you want to leave?'
            : 'There was an error saving your changes. Are you sure you want to leave?';

        // For modern browsers
        e.preventDefault();
        // For older browsers
        e.returnValue = message;
        return message;
      }
    };

    // Handle browser/tab close
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Handle SPA navigation (if using React Router)
    const handleNavigation = (e: PopStateEvent) => {
      if (saveStatus === 'saving' || saveStatus === 'error') {
        const message =
          saveStatus === 'saving'
            ? 'Changes are being saved. Are you sure you want to leave?'
            : 'There was an error saving your changes. Are you sure you want to leave?';

        if (!window.confirm(message)) {
          e.preventDefault();
          // Push the current state back to prevent navigation
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    window.addEventListener('popstate', handleNavigation);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, [saveStatus, saveError]);
}
