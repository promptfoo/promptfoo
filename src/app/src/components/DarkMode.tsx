import { cn } from '@app/lib/utils';
import { Moon, Sun } from 'lucide-react';

interface DarkModeToggleProps {
  onToggleDarkMode: () => void;
}

function DarkModeToggle({ onToggleDarkMode }: DarkModeToggleProps) {
  // Check if dark mode is active by looking at the data-theme attribute
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <button
      type="button"
      onClick={onToggleDarkMode}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-full p-2',
        'transition-all duration-200',
        'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]',
        'hover:rotate-[15deg]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      {/* Moon icon - visible in dark mode */}
      <Moon
        className={cn(
          'size-5 absolute transition-all duration-200',
          isDarkMode ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90',
        )}
      />
      {/* Sun icon - visible in light mode */}
      <Sun
        className={cn(
          'size-5 transition-all duration-200',
          isDarkMode ? 'opacity-0 rotate-90' : 'opacity-100 rotate-0',
        )}
      />
    </button>
  );
}

export default DarkModeToggle;
